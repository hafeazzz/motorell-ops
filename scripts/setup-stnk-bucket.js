/* Cek & uji bucket Storage `stnk`.
 *
 *   node scripts/setup-stnk-bucket.js
 *
 * PENTING — kenapa skrip ini TIDAK bisa membuat bucketnya sendiri:
 * kunci yang dipakai app adalah publishable/anon key, dan createBucket() dengannya ditolak
 * ("new row violates row-level security policy"). Membuat bucket butuh service_role key atau
 * Dashboard. Sudah diuji, bukan dugaan.
 *
 * JANGAN menaruh service_role key di .env.local dengan awalan VITE_. Semua variabel VITE_*
 * ditanam ke dalam bundle browser oleh Vite — service_role melewati SELURUH RLS, jadi menaruhnya
 * di sana sama dengan memberi akses admin penuh ke database kepada siapa pun yang membuka
 * situsnya. Kalau memang mau dipakai sekali untuk membuat bucket, berikan lewat variabel
 * lingkungan sesaat dan jangan pernah ditulis ke berkas:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/setup-stnk-bucket.js
 *
 * Kredensial Supabase dibaca dari src/storage.js (memang di situ tempatnya — BUKAN .env.local,
 * yang isinya Firebase).
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const BUCKET = "stnk";
const MAX_MB = 5;

const src = fs.readFileSync(path.resolve("src/storage.js"), "utf-8");
const ambil = (nama) => (src.match(new RegExp(`const ${nama}\\s*=\\s*"([^"]+)"`)) || [])[1];
const SUPABASE_URL = process.env.SUPABASE_URL || ambil("SUPABASE_URL");
const PUBLISHABLE = ambil("SUPABASE_PUBLISHABLE_KEY");
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !PUBLISHABLE) {
  // `return` di tingkat atas modul ESM itu SyntaxError, jadi dilempar saja — ditangkap di bawah.
  throw new Error("Kredensial Supabase tidak terbaca dari src/storage.js");
}
console.log("🔧 Supabase URL:", SUPABASE_URL);
console.log("🔑 Kunci        :", SERVICE_ROLE ? "service_role (dari env, bisa membuat bucket)" : "publishable (hanya bisa mengecek & menguji)");

const app = createClient(SUPABASE_URL, PUBLISHABLE);
const admin = SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;

const PETUNJUK_MANUAL = `
Buat manual — 1 menit, ini jalur yang disarankan:

  1. Supabase Dashboard → Storage → New bucket
       Name                : ${BUCKET}
       Public bucket       : NONAKTIF  (biarkan privat — lihat catatan di bawah)
       File size limit     : ${MAX_MB} MB
       Allowed MIME types  : image/*

  2. Dashboard → SQL Editor, jalankan:

     drop policy if exists "stnk read"   on storage.objects;
     create policy "stnk read"   on storage.objects for select using (bucket_id = '${BUCKET}');
     drop policy if exists "stnk insert" on storage.objects;
     create policy "stnk insert" on storage.objects for insert with check (bucket_id = '${BUCKET}');
     drop policy if exists "stnk delete" on storage.objects;
     create policy "stnk delete" on storage.objects for delete using (bucket_id = '${BUCKET}');

  3. Jalankan lagi skrip ini untuk memastikan.

Kenapa PRIVAT, bukan publik: kode yang sudah jalan (storage.stnkSignedUrl) mengambil gambarnya
lewat signed URL dan menyimpan PATH di unit.stnkPath — tidak pernah memakai URL publik sama
sekali. Jadi menyalakan "Public" tidak menambah fungsi apa pun, cuma membuat foto STNK (nama &
alamat pemilik, nomor rangka, nomor mesin) bisa dibuka permanen oleh siapa saja yang pernah
melihat tautannya.
`;

async function main() {
  console.log(`\n📦 Memeriksa bucket "${BUCKET}"…\n`);

  /* Keberadaan bucket sengaja TIDAK dicek lewat list()/listBuckets() lebih dulu: dua-duanya
     tidak bisa dipercaya dengan anon key (listBuckets balik 0 walau bucket lain ada; list() pada
     bucket yang tidak ada balik sukses dengan array kosong). Yang menentukan cuma percobaan
     unggah sungguhan — itu juga yang benar-benar dilakukan app. */
  if (admin) {
    const { error } = await admin.storage.getBucket(BUCKET);
    if (error) {
      console.log("⏳ Bucket belum ada — mencoba membuat dengan service_role…");
      const c = await admin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_MB * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
      });
      if (c.error) { console.error("❌ Gagal membuat bucket:", c.error.message); console.log(PETUNJUK_MANUAL); process.exitCode = 1; return; }
      console.log(`✅ Bucket dibuat (privat, maks ${MAX_MB}MB, image/*)`);
      console.log("⚠️  Policy TETAP harus dipasang manual di SQL Editor — langkah 2 di bawah.\n");
    } else {
      console.log("✅ Bucket sudah ada\n");
    }
  }

  // ── Uji bolak-balik dengan kunci yang DIPAKAI APP, bukan service_role ──
  // Ini yang penting: bukan "bucketnya ada", tapi "app beneran bisa menulis & membacanya".
  console.log("🧪 Uji unggah → signed URL → ambil → hapus (pakai kunci app)…\n");
  const objek = `_cek/${Date.now()}.txt`;
  const isi = new Blob(["cek konektivitas"], { type: "text/plain" });

  const up = await app.storage.from(BUCKET).upload(objek, isi, { upsert: true });
  if (up.error) {
    const hilang = /bucket not found/i.test(up.error.message);
    console.error("❌ Unggah GAGAL:", up.error.message);
    if (hilang) console.error(`   → bucket "${BUCKET}" belum dibuat.` + (admin ? "" : " Publishable key tidak boleh membuatnya (ditolak RLS)."));
    else if (/row-level security|policy/i.test(up.error.message)) console.error("   → bucketnya ada, tapi policy insert belum dipasang (langkah 2).");
    console.log(PETUNJUK_MANUAL);
    process.exitCode = 1;
    return;
  }
  console.log("  ✅ unggah");

  const sig = await app.storage.from(BUCKET).createSignedUrl(objek, 60);
  if (sig.error || !sig.data?.signedUrl) {
    console.error("❌ Signed URL GAGAL:", sig.error?.message || "kosong");
    console.error("   → policy select belum dipasang. Inilah yang dipakai StnkView untuk menampilkan foto.");
    await app.storage.from(BUCKET).remove([objek]);
    process.exitCode = 1;
    return;
  }
  console.log("  ✅ signed URL");

  const res = await fetch(sig.data.signedUrl);
  console.log(res.ok ? "  ✅ isi terbaca lewat signed URL" : `  ❌ signed URL tidak bisa diambil (HTTP ${res.status})`);

  const pub = app.storage.from(BUCKET).getPublicUrl(objek);
  const pubRes = await fetch(pub.data.publicUrl).catch(() => null);
  console.log(pubRes && pubRes.ok
    ? "  ⚠️  bucket ini PUBLIK — foto STNK bisa dibuka siapa saja lewat URL tetap"
    : "  ✅ bucket privat (URL publik ditolak — memang yang diinginkan)");

  const del = await app.storage.from(BUCKET).remove([objek]);
  console.log(del.error ? `  ⚠️  gagal menghapus berkas uji: ${del.error.message} (policy delete belum ada — dipakai saat "Ganti foto STNK")` : "  ✅ hapus");

  const beres = !up.error && !sig.error && res.ok && !del.error;
  console.log("\n" + "═".repeat(60));
  console.log(beres ? "✅ BUCKET STNK SIAP DIPAKAI" : "⚠️  BUCKET ADA TAPI BELUM SEPENUHNYA SIAP — lihat pesan di atas");
  console.log("═".repeat(60) + "\n");
  process.exitCode = beres ? 0 : 1;
}

main().catch((e) => { console.error("❌ Error tak terduga:", e); process.exitCode = 1; return; });
