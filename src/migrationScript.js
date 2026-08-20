/* Migrasi data Supabase → Firebase. HANYA untuk masa migrasi; hapus setelah selesai.
   Tidak diimpor App.jsx sama sekali — dijalankan manual dari console browser.

   BACA DULU peringatan cakupan di src/firebaseService.js. Ringkasnya: berkas ini cuma memindah
   units / users / tasks / expenses (±59 catatan). Attendance (134), media, lives, inspections,
   extras, verifikasi, chat, dan kedua bucket Storage TIDAK ikut (±161 catatan) — lebih banyak
   daripada yang dipindah. Jangan dianggap migrasi lengkap. */
import {
  bulkImportUnits,
  bulkImportUsers,
  bulkImportTasks,
  bulkImportExpenses,
  getCollectionCounts,
  testFirebaseConnection,
} from "./firebaseService";

// Yang ada di Supabase tapi TIDAK ditangani berkas ini. Dipakai buat mengingatkan saat dijalankan.
const TIDAK_IKUT = ["attendance", "media", "lives", "inspections", "extras", "verifikasi", "chat", "storage:handbook", "storage:stnk", "push subscriptions"];

export const migrateDataToFirebase = async (exportedData) => {
  console.log("\n🚀 Memulai migrasi data…\n");
  console.warn("⚠️  TIDAK ikut dimigrasi oleh skrip ini:", TIDAK_IKUT.join(", "));
  console.warn("   Pastikan itu sudah diputuskan sebelum Supabase dimatikan.\n");

  try {
    console.log("TES: koneksi Firebase");
    const connected = await testFirebaseConnection();
    if (!connected) {
      console.error("❌ Firebase tidak tersambung");
      return { success: false, error: "Firebase connection failed" };
    }
    console.log("✅ Tersambung\n");

    console.log("📊 Isi Firebase SEBELUM impor…");
    const beforeCounts = await getCollectionCounts();
    console.log("Sebelum:", beforeCounts, "\n");

    const hasil = {};
    const bagian = [
      ["units", exportedData && exportedData.units, bulkImportUnits],
      ["users", exportedData && exportedData.users, bulkImportUsers],
      ["tasks", exportedData && exportedData.tasks, bulkImportTasks],
      ["expenses", exportedData && exportedData.expenses, bulkImportExpenses],
    ];
    for (const [nama, data, impor] of bagian) {
      if (!data || !data.length) { console.log(`⏭️  ${nama}: tidak ada data, dilewati`); continue; }
      console.log(`⏳ Mengimpor ${data.length} ${nama}…`);
      hasil[nama] = await impor(data);
      console.log(`✅ ${hasil[nama]} ${nama} masuk\n`);
    }

    console.log("📊 Isi Firebase SESUDAH impor…");
    const afterCounts = await getCollectionCounts();
    console.log("Sesudah:", afterCounts, "\n");

    /* Verifikasi membandingkan JUMLAH sebelum+diimpor vs sesudah, bukan sekadar "sesudah >
       sebelum". Impor idempoten (set by id) menimpa dokumen yang sama, jadi menjalankan ulang
       TIDAK menaikkan jumlah — pengecekan "lebih besar" akan salah lapor gagal padahal berhasil. */
    const verification = {};
    for (const [nama, data] of bagian.map(([n, d]) => [n, d])) {
      const diminta = (data && data.length) || 0;
      const naik = (afterCounts[nama] || 0) - (beforeCounts[nama] || 0);
      verification[nama] = {
        diminta,
        masuk: hasil[nama] || 0,
        bertambah: naik,
        ok: diminta === 0 ? true : (hasil[nama] || 0) === diminta && (afterCounts[nama] || 0) >= diminta,
      };
    }

    const semuaOk = Object.values(verification).every((v) => v.ok);
    console.log(semuaOk ? "✅ Migrasi selesai" : "⚠️  Migrasi selesai DENGAN SELISIH — periksa di bawah");
    console.table(verification);
    console.warn("\n⚠️  Ingat, belum ikut pindah:", TIDAK_IKUT.join(", "));

    return { success: semuaOk, beforeCounts, afterCounts, verification };
  } catch (err) {
    console.error("❌ Migrasi gagal:", err);
    return { success: false, error: err.message };
  }
};

export const testMigrationSetup = async () => {
  console.log("\n🧪 Menguji setup Firebase…\n");
  try {
    console.log("TES 1: koneksi");
    const connected = await testFirebaseConnection();
    if (!connected) { console.error("❌ Koneksi gagal"); return false; }
    console.log("✅ Tersambung\n");

    console.log("TES 2: baca koleksi");
    const counts = await getCollectionCounts();
    console.log("Jumlah:", counts);
    console.log("✅ Koleksi bisa dibaca\n");

    console.log("✅ Semua tes setup lolos");
    return true;
  } catch (err) {
    console.error("❌ Tes setup gagal:", err);
    return false;
  }
};
