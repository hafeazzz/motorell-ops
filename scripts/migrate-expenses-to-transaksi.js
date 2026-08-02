/* Migrasi pengeluaran unit dari blob KV (state.expenses) ke tabel `transaksi_detail`.
 *
 * MENYALIN, bukan memindahkan. Data di KV TIDAK disentuh sama sekali — tidak dihapus, tidak
 * diubah. Jadi kalau hasilnya tidak sesuai, cukup hapus baris di transaksi_detail; app tetap
 * jalan seperti biasa karena semua hitungan profit masih membaca state.expenses.
 *
 * Jalankan:
 *   node scripts/migrate-expenses-to-transaksi.js              # dry run (default, aman)
 *   node scripts/migrate-expenses-to-transaksi.js --sql        # dry run + cetak SQL
 *   node scripts/migrate-expenses-to-transaksi.js --execute    # benar-benar menulis
 *
 * AMAN DIULANG. Tiap baris hasil migrasi diberi penanda `[migrasi:<id-expense-asal>]` di kolom
 * catatan. Sebelum menulis, skrip membaca penanda yang sudah ada dan melewati yang sudah pernah
 * masuk — jadi menjalankan --execute dua kali TIDAK menggandakan data.
 *
 * CATATAN soal "BEGIN/COMMIT": PostgREST (yang dipakai supabase-js) tidak punya transaksi lintas
 * request — tidak ada BEGIN/ROLLBACK yang bisa dipanggil dari sini. Yang bisa dilakukan: satu
 * INSERT berisi banyak baris itu atomik per pernyataan (semua masuk atau semua gagal). Skrip ini
 * mengirim per-batch; kalau satu batch gagal, batch itu diulang baris-per-baris supaya baris yang
 * bermasalah bisa diisolasi dan dilaporkan, bukan menggagalkan semuanya. Untuk atomicity penuh
 * satu-satunya cara adalah RPC/function di sisi Postgres.
 */
import { supabase } from "../src/storage.js";

const KV_KEY = "motorell-state-v3";
const TABLE = "transaksi_detail";
const JENIS_TABLE = "jenis_layanan";

/* Label kategori pengeluaran, disalin dari CATS di src/App.jsx. Dipakai buat deskripsi cadangan
   dan buat mengawetkan kategori asal di catatan. */
const CAT_LABEL = {
  service: "Service",
  jasa: "Jasa",
  bensin: "Bensin",
  sparepart: "Sparepart",
  pajak: "Pajak",
};

/* Peta kategori lama -> nama jenis_layanan. Tidak semua punya padanan: `bensin` dan `pajak`
   bukan "layanan" sama sekali, dan jenis_layanan cuma punya 5 pilihan. Yang tak punya padanan
   jatuh ke Servis. Karena pemetaan ini LOSSY (5 kategori -> 3 jenis), kategori aslinya selalu
   ikut ditulis di catatan supaya tidak ada informasi yang hilang. */
const CAT_TO_JENIS = {
  service: "Servis",
  sparepart: "Perbaikan",
  jasa: "Servis",
  bensin: "Perawatan",
  pajak: "Servis",
};
const JENIS_DEFAULT = "Servis";

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const SHOW_SQL = argv.includes("--sql");
const BATCH = 100;

const rp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const penanda = (expenseId) => `[migrasi:${expenseId}]`;
const sq = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

async function main() {
  console.log("=".repeat(72));
  console.log(EXECUTE ? "MODE: --execute (MENULIS ke database)" : "MODE: dry run (tidak menulis apa pun)");
  console.log("=".repeat(72) + "\n");

  // --- 1. Ambil sumber data -------------------------------------------------
  const { data: kvRows, error: kvErr } = await supabase.from("kv").select("value").eq("key", KV_KEY).maybeSingle();
  if (kvErr) { console.error("Gagal baca kv:", kvErr.message); process.exit(1); }
  if (!kvRows || !kvRows.value) { console.error(`kv key "${KV_KEY}" tidak ditemukan.`); process.exit(1); }

  let blob;
  try { blob = JSON.parse(kvRows.value); }
  catch (e) { console.error("Blob kv bukan JSON yang sah:", e.message); process.exit(1); }

  const expenses = Array.isArray(blob.expenses) ? blob.expenses : [];
  console.log(`Total entri dibaca (state.expenses) : ${expenses.length}`);

  const { data: unitRows, error: uErr } = await supabase.from("units").select("data");
  if (uErr) { console.error("Gagal baca units:", uErr.message); process.exit(1); }
  const unitById = new Map((unitRows || []).map((r) => [r.data && r.data.id, r.data]).filter(([k]) => k));
  console.log(`Unit di tabel units                 : ${unitById.size}`);

  const { data: jenisRows, error: jErr } = await supabase.from(JENIS_TABLE).select("id,nama");
  if (jErr) { console.error("Gagal baca jenis_layanan:", jErr.message); process.exit(1); }
  const jenisByNama = new Map((jenisRows || []).map((r) => [r.nama, r.id]));
  console.log(`Jenis layanan tersedia              : ${[...jenisByNama.keys()].join(", ")}`);

  if (!jenisByNama.has(JENIS_DEFAULT)) {
    console.error(`\nJenis layanan default "${JENIS_DEFAULT}" tidak ada di tabel jenis_layanan. Berhenti.`);
    process.exit(1);
  }

  // --- 2. Penanda yang sudah ada (idempotensi) ------------------------------
  const { data: adaRows, error: aErr } = await supabase.from(TABLE).select("catatan");
  if (aErr) { console.error("Gagal baca transaksi_detail:", aErr.message); process.exit(1); }
  const sudahMasuk = new Set();
  for (const r of adaRows || []) {
    const m = String(r.catatan || "").match(/\[migrasi:([^\]]+)\]/);
    if (m) sudahMasuk.add(m[1]);
  }
  console.log(`Sudah pernah dimigrasi              : ${sudahMasuk.size}\n`);

  // --- 3. Petakan + validasi ------------------------------------------------
  const laporan = { dibaca: expenses.length, lolos: 0, dilewati: 0, dimasukkan: 0, gagal: 0, errors: [], perUnit: {} };
  const siap = [];

  for (const e of expenses) {
    const id = (e && e.id) || "(tanpa-id)";
    const tolak = (alasan) => { laporan.dilewati++; laporan.errors.push({ id, alasan }); };

    if (!e || typeof e !== "object") { tolak("entri bukan objek"); continue; }
    if (sudahMasuk.has(e.id)) { tolak("sudah pernah dimigrasi"); continue; }
    if (!e.unitId) { tolak("unitId kosong"); continue; }
    if (!unitById.has(e.unitId)) { tolak(`unitId "${e.unitId}" tidak ada di tabel units`); continue; }

    const harga = Number(e.amount);
    if (!Number.isFinite(harga) || harga <= 0) { tolak(`harga tidak valid (${e.amount})`); continue; }

    const label = CAT_LABEL[e.cat] || e.cat || "Lainnya";
    // Ada 1 expense yang note-nya kosong; deskripsi tidak boleh kosong, jadi pakai label kategori.
    const deskripsi = String(e.note || "").trim() || label;
    if (!deskripsi) { tolak("deskripsi kosong"); continue; }

    const jenisNama = CAT_TO_JENIS[e.cat] || JENIS_DEFAULT;
    const jenisId = jenisByNama.get(jenisNama) || jenisByNama.get(JENIS_DEFAULT);
    // Tanggal wajib ada; kalau expense lama tidak punya, pakai hari ini (didokumentasikan di guide).
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || "")) ? e.date : new Date().toISOString().slice(0, 10);

    siap.push({
      unit_id: e.unitId,
      jenis_layanan_id: jenisId,
      deskripsi,
      harga,
      // Kategori asal diawetkan di sini karena pemetaan ke jenis_layanan lossy.
      catatan: `[kategori: ${label}] ${penanda(e.id)}`,
      status: "selesai", // semua pengeluaran lama = kejadian yang sudah lewat
      tanggal_mulai: tanggal,
      tanggal_selesai: tanggal,
      created_by: e.by || null,
      is_deleted: false,
    });

    laporan.lolos++;
    // Dikelompokkan per unitId, BUKAN per nama: ada beberapa unit yang namanya sama persis
    // (mis. dua "Yamaha XSR 155 2020"), kalau dikunci nama keduanya menyatu dan ringkasannya
    // menyesatkan waktu ditinjau.
    const u = unitById.get(e.unitId) || {};
    laporan.perUnit[e.unitId] = laporan.perUnit[e.unitId] || { jumlah: 0, total: 0, label: `${u.name || e.unitId}${u.plate ? " (" + u.plate + ")" : ""}` };
    laporan.perUnit[e.unitId].jumlah++;
    laporan.perUnit[e.unitId].total += harga;
  }

  console.log(`Lolos validasi                      : ${laporan.lolos}`);
  console.log(`Dilewati                            : ${laporan.dilewati}`);
  if (laporan.errors.length) {
    console.log("\nRincian yang dilewati:");
    for (const x of laporan.errors) console.log(`  - ${x.id}: ${x.alasan}`);
  }

  console.log("\nRingkasan per unit:");
  const urut = Object.entries(laporan.perUnit).sort((a, b) => b[1].total - a[1].total);
  for (const [, v] of urut) console.log(`  ${String(v.jumlah).padStart(2)}x  ${rp(v.total).padStart(14)}  ${v.label}`);
  console.log(`  ${"-".repeat(40)}`);
  console.log(`  ${String(laporan.lolos).padStart(2)}x  ${rp(urut.reduce((a, [, v]) => a + v.total, 0)).padStart(14)}  TOTAL`);

  if (SHOW_SQL && siap.length) {
    console.log("\nSQL setara (buat ditinjau saja — skrip memakai REST, bukan SQL ini):");
    for (const r of siap) {
      console.log(
        `INSERT INTO transaksi_detail (unit_id,jenis_layanan_id,deskripsi,harga,catatan,status,tanggal_mulai,tanggal_selesai,created_by,is_deleted) VALUES (` +
        `${sq(r.unit_id)},${sq(r.jenis_layanan_id)},${sq(r.deskripsi)},${r.harga},${sq(r.catatan)},${sq(r.status)},${sq(r.tanggal_mulai)},${sq(r.tanggal_selesai)},${sq(r.created_by)},false);`
      );
    }
  }

  // --- 4. Tulis (kalau diminta) ---------------------------------------------
  if (!EXECUTE) {
    console.log("\n" + "=".repeat(72));
    console.log("DRY RUN — tidak ada yang ditulis.");
    console.log("Kalau ringkasan di atas sudah benar, jalankan ulang dengan --execute.");
    console.log("=".repeat(72));
    return laporan;
  }

  if (!siap.length) {
    console.log("\nTidak ada baris yang perlu dimasukkan. Selesai.");
    return laporan;
  }

  console.log(`\nMenulis ${siap.length} baris ke ${TABLE}…`);
  for (let i = 0; i < siap.length; i += BATCH) {
    const batch = siap.slice(i, i + BATCH);
    const { error } = await supabase.from(TABLE).insert(batch);
    if (!error) { laporan.dimasukkan += batch.length; continue; }

    // Batch gagal = tidak ada satu pun baris di batch itu yang masuk (INSERT atomik per pernyataan).
    // Diulang satu-satu supaya baris bermasalah terisolasi, sisanya tetap bisa masuk.
    console.warn(`  batch ${i / BATCH + 1} gagal (${error.message}) — diulang baris per baris…`);
    for (const row of batch) {
      const { error: e2 } = await supabase.from(TABLE).insert(row);
      if (e2) {
        laporan.gagal++;
        laporan.errors.push({ id: row.catatan, alasan: `insert gagal: ${e2.message}` });
        console.warn(`    GAGAL ${row.deskripsi}: ${e2.message}`);
      } else laporan.dimasukkan++;
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log(`Dibaca      : ${laporan.dibaca}`);
  console.log(`Lolos       : ${laporan.lolos}`);
  console.log(`Dimasukkan  : ${laporan.dimasukkan}`);
  console.log(`Dilewati    : ${laporan.dilewati}`);
  console.log(`Gagal       : ${laporan.gagal}`);
  console.log("=".repeat(72));
  console.log("\nData di KV TIDAK disentuh. Semua hitungan profit di app masih memakai state.expenses.");
  return laporan;
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("\nMigrasi berhenti karena error tak terduga:", e); process.exit(1); });
