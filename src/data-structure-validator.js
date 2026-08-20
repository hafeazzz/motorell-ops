/* Validator bentuk data hasil ekspor Supabase, dijalankan SEBELUM impor ke Firebase.
   Dicocokkan ke skema yang benar-benar ada (dicek ke produksi 21 Agustus 2026), bukan skema
   karangan — validator yang salah lebih berbahaya daripada tidak ada validator, karena
   memberi rasa aman palsu.

   Pakai di console browser:
     const data = { units: [...], users: [...], tasks: [...], expenses: [...] };
     validateAllData(data);
*/

const ok = (v) => v !== undefined && v !== null && String(v).trim() !== "";

/* Unit: satu-satunya yang WAJIB cuma id + name + status.
   brand/model/color/year sengaja TIDAK diwajibkan: cuma 3 dari 22 unit punya, sisanya dibuat
   sebelum nama dipecah 4 bagian dan identitasnya ada di `name`. Mewajibkannya bakal memunculkan
   19 peringatan palsu dan menutupi masalah yang beneran. */
export const validateUnitsStructure = (units) => {
  if (!Array.isArray(units)) return { valid: false, totalRows: 0, errors: ["Bukan array"], warnings: [] };
  const errors = [], warnings = [];
  const ids = new Set();

  units.forEach((u, i) => {
    const tag = `Unit[${i}]${u && u.id ? ` id=${u.id}` : ""}`;
    if (!u || typeof u !== "object") { errors.push(`${tag}: bukan objek`); return; }

    // Kesalahan paling mahal: baris tabel ikut terekspor, bukan isi kolom `data`.
    if (u.data && typeof u.data === "object") {
      errors.push(`${tag}: masih terbungkus { data: {...} } — ekspor isi kolom data, bukan barisnya (lihat export-queries.md Query 1)`);
      return;
    }
    if (!ok(u.id)) errors.push(`${tag}: id kosong — id lama wajib dipertahankan (expenses.unitId & path STNK menunjuk ke sini)`);
    else if (ids.has(u.id)) errors.push(`${tag}: id dobel`);
    else ids.add(u.id);

    if (!ok(u.name)) errors.push(`${tag}: name kosong — dipakai di kartu, Arsip, dan pengelompokan Laporan`);
    if (!ok(u.status)) errors.push(`${tag}: status kosong`);
    else if (!["proses", "siap", "ter_dp", "terjual"].includes(u.status)) errors.push(`${tag}: status tidak dikenal "${u.status}"`);

    // Angka: string pun diterima Firestore, tapi App.jsx menghitung langsung → NaN diam-diam.
    for (const f of ["buyPrice", "sellPrice", "odometer", "dp", "investorShare"]) {
      if (u[f] !== undefined && u[f] !== null && u[f] !== "" && !Number.isFinite(Number(u[f]))) {
        errors.push(`${tag}: ${f} bukan angka: ${JSON.stringify(u[f])}`);
      }
    }
    if (u.investors !== undefined && !Array.isArray(u.investors)) {
      errors.push(`${tag}: investors harus array, dapat ${typeof u.investors} — kemungkinan diekspor pakai data->>'investors' (teks) bukan data->'investors'`);
    }
    if (u.status === "terjual" && !ok(u.soldAt)) warnings.push(`${tag}: terjual tapi soldAt kosong → hilang dari hitungan bulanan`);
    if (u.status === "ter_dp" && !(Number(u.dp) > 0)) warnings.push(`${tag}: ter_dp tapi dp kosong`);
    if (!ok(u.stnkPath)) warnings.push(`${tag}: belum ada foto STNK (unit lama — wajar)`);
  });

  return { valid: errors.length === 0, totalRows: units.length, errors, warnings };
};

/* User: id wajib dan harus id app (u_own / kyldr20), BUKAN UUID auth — tidak ada Supabase Auth. */
export const validateUsersStructure = (users) => {
  if (!Array.isArray(users)) return { valid: false, totalRows: 0, errors: ["Bukan array"], warnings: [] };
  const errors = [], warnings = [];
  const ids = new Set();
  users.forEach((u, i) => {
    const tag = `User[${i}]${u && u.id ? ` id=${u.id}` : ""}`;
    if (!u || typeof u !== "object") { errors.push(`${tag}: bukan objek`); return; }
    if (!ok(u.id)) errors.push(`${tag}: id kosong`);
    else if (ids.has(u.id)) errors.push(`${tag}: id dobel`);
    else ids.add(u.id);
    if (!ok(u.name)) errors.push(`${tag}: name kosong`);
    if (!["owner", "admin", "staff"].includes(u.role)) errors.push(`${tag}: role tidak dikenal "${u.role}" (harus owner/admin/staff)`);
    if (u.saleBonus !== undefined && typeof u.saleBonus !== "boolean") warnings.push(`${tag}: saleBonus bukan boolean`);
  });
  if (users.length && !users.some((u) => u && u.role === "owner")) errors.push("Tidak ada satu pun user ber-role owner — tidak akan ada yang bisa mengelola tim");
  return { valid: errors.length === 0, totalRows: users.length, errors, warnings };
};

/* Task: sudah dipetakan ke bentuk app (userId/setBy), bukan kolom mentah (user_id/set_by). */
export const validateTasksStructure = (tasks) => {
  if (!Array.isArray(tasks)) return { valid: false, totalRows: 0, errors: ["Bukan array"], warnings: [] };
  const errors = [], warnings = [];
  tasks.forEach((t, i) => {
    const tag = `Task[${i}]${t && t.id ? ` id=${t.id}` : ""}`;
    if (!t || typeof t !== "object") { errors.push(`${tag}: bukan objek`); return; }
    if (!ok(t.id)) errors.push(`${tag}: id kosong`);
    if (!ok(t.title)) errors.push(`${tag}: title kosong`);
    if (t.user_id !== undefined && t.userId === undefined) errors.push(`${tag}: masih pakai kolom mentah user_id — harus dipetakan jadi userId (export-queries.md Query 3)`);
    if (!ok(t.userId)) errors.push(`${tag}: userId kosong`);
    if (t.done !== undefined && typeof t.done !== "boolean") warnings.push(`${tag}: done bukan boolean`);
  });
  return { valid: errors.length === 0, totalRows: tasks.length, errors, warnings };
};

/* Expense: field aslinya { id, unitId, cat, amount, note, by, date } — BUKAN
   description/category seperti di draf spec. */
export const validateExpensesStructure = (expenses, units) => {
  if (!Array.isArray(expenses)) return { valid: false, totalRows: 0, errors: ["Bukan array"], warnings: [] };
  const errors = [], warnings = [];
  const unitIds = new Set((units || []).map((u) => u && u.id).filter(Boolean));
  expenses.forEach((e, i) => {
    const tag = `Expense[${i}]${e && e.id ? ` id=${e.id}` : ""}`;
    if (!e || typeof e !== "object") { errors.push(`${tag}: bukan objek`); return; }
    if (!ok(e.id)) errors.push(`${tag}: id kosong — dipakai supaya impor ulang tidak menggandakan`);
    if (!Number.isFinite(Number(e.amount))) errors.push(`${tag}: amount bukan angka: ${JSON.stringify(e.amount)}`);
    if (!ok(e.unitId)) errors.push(`${tag}: unitId kosong`);
    else if (unitIds.size && !unitIds.has(e.unitId)) errors.push(`${tag}: unitId "${e.unitId}" tidak ada di units — kaitannya putus`);
    if (e.description !== undefined || e.category !== undefined) warnings.push(`${tag}: ada field description/category — field aslinya note/cat`);
  });
  return { valid: errors.length === 0, totalRows: expenses.length, errors, warnings };
};

export const validateAllData = (data) => {
  const d = data || {};
  const details = {};
  if (d.units) details.units = validateUnitsStructure(d.units);
  if (d.users) details.users = validateUsersStructure(d.users);
  if (d.tasks) details.tasks = validateTasksStructure(d.tasks);
  if (d.expenses) details.expenses = validateExpensesStructure(d.expenses, d.units);

  // Jumlah yang diharapkan per 21 Agustus 2026 — kalau meleset, ekspornya kemungkinan kepotong.
  const HARAPAN = { units: 22, users: 6, tasks: 15, expenses: 16 };
  const jumlah = {};
  for (const [k, v] of Object.entries(details)) {
    jumlah[k] = { ada: v.totalRows, diharapkan: HARAPAN[k], cocok: v.totalRows === HARAPAN[k] };
  }

  const allValid = Object.values(details).every((v) => v.valid);
  const hasil = { timestamp: new Date().toISOString(), allValid, jumlah, details };

  console.log("\n📋 LAPORAN VALIDASI DATA");
  console.table(jumlah);
  for (const [k, v] of Object.entries(details)) {
    if (v.errors.length) { console.error(`❌ ${k}: ${v.errors.length} error`); v.errors.forEach((e) => console.error("   " + e)); }
    if (v.warnings.length) { console.warn(`⚠️  ${k}: ${v.warnings.length} peringatan`); v.warnings.slice(0, 10).forEach((w) => console.warn("   " + w)); if (v.warnings.length > 10) console.warn(`   …dan ${v.warnings.length - 10} lagi`); }
    if (!v.errors.length && !v.warnings.length) console.log(`✅ ${k}: bersih (${v.totalRows} baris)`);
  }
  console.log(allValid ? "\n✅ Boleh lanjut impor." : "\n❌ JANGAN impor dulu — perbaiki error di atas.");
  console.warn("⚠️  Ingat: attendance(134), media(13), chat(8), lives(3), inspections(1), extras(1), verifikasi(1) TIDAK ikut skrip ini.");

  return hasil;
};

// Dipasang ke window supaya gampang dipanggil dari console. Dijaga: berkas ini juga bisa
// diimpor di Node (tanpa window) saat diuji.
if (typeof window !== "undefined") window.validateAllData = validateAllData;
