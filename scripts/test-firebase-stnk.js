/* Uji Firebase Storage untuk foto STNK.
 *
 *   npm run test:firebase
 *
 * KENAPA TIDAK MENGIMPOR src/firebaseService.js: berkas itu (lewat src/firebaseConfig.js) membaca
 * import.meta.env — objek buatan Vite yang TIDAK ada di Node, jadi impornya langsung TypeError
 * sebelum satu tes pun jalan. Jadi skrip ini membaca .env.local sendiri dan menginisialisasi
 * Firebase-nya sendiri. Pola yang sama dipakai scripts/setup-stnk-bucket.js.
 *
 * Yang diuji adalah operasi yang benar-benar dipakai app: unggah → URL download → ambil isinya →
 * hapus. Bukan sekadar "bucketnya ada".
 */
import fs from "node:fs";
import path from "node:path";
import { initializeApp, deleteApp } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL, getMetadata, listAll, deleteObject } from "firebase/storage";

/* ── Baca .env.local (Vite yang biasanya melakukan ini; di Node harus manual) ── */
const envPath = path.resolve(".env.local");
if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local tidak ditemukan. Salin dari .env.example lalu isi nilainya.");
  process.exit(1);
}
const env = {};
for (const baris of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const kurang = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
if (kurang.length) {
  console.error("❌ Env Firebase belum lengkap di .env.local:", kurang.join(", "));
  process.exit(1);
}

const RULES = `
Security Rules yang cocok untuk app ini (Firebase Console → Storage → Rules → Publish):

  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /stnk/{unitId}/{berkas} {
        allow read;                                   // <img src> butuh ini, app tidak punya auth
        allow write: if request.resource.size < 5 * 1024 * 1024
                     && request.resource.contentType.matches('image/.*');
        allow delete;                                 // dipakai saat "Ganti foto STNK"
      }
      match /_cek/{berkas} { allow read, write, delete; }   // buat skrip ini
    }
  }

Perhatikan: rules bawaan Firebase adalah "if request.auth != null". Motorell Ops TIDAK punya
sistem auth (login-nya cuma pilih user + cek password di sisi klien), jadi rules bawaan akan
menolak SEMUA unggahan dari app. Rules di atas membuka bucket-nya — sadari konsekuensinya:
siapa pun yang tahu path-nya bisa membaca foto STNK. Pengamanan sungguhan butuh Firebase Auth.
`;

const PETUNJUK_BUCKET = `
→ Bucket-nya BELUM ADA (server balas 404, bukan 403 — jadi ini bukan soal rules).

  Firebase Storage tidak bisa dibuat lewat skrip dengan kunci web seperti ini — sama persis
  dengan bucket Supabase dulu (lihat scripts/setup-stnk-bucket.js). Harus lewat Console:

    1. Firebase Console → project "${env.VITE_FIREBASE_PROJECT_ID}" → Build → Storage → Get started
    2. Pilih lokasi (mis. asia-southeast2 / Jakarta) — TIDAK BISA diubah setelah dipilih
    3. Storage sekarang mensyaratkan paket Blaze (pay-as-you-go). Kuota gratisnya tetap ada,
       tapi kartu tetap harus terpasang. Kalau project masih Spark, langkah 1 akan meminta upgrade.
    4. Pasang Security Rules (di bawah), lalu jalankan skrip ini lagi.
${RULES}`;

// Endpoint REST ditanya langsung karena SDK menyembunyikan kode status aslinya.
async function probeStatus() {
  try {
    const url = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o?name=_cek/probe-${Date.now()}.txt`;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "probe" });
    return r.status;
  } catch {
    return null;
  }
}

async function main() {
  console.log("\n🔥 Uji Firebase Storage — foto STNK\n");
  console.log("  Project :", firebaseConfig.projectId);
  console.log("  Bucket  :", firebaseConfig.storageBucket, "\n");

  /* process.exit() selagi SDK masih memegang handle bikin libuv assert & crash di Windows
     ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"), yang menutupi hasil tesnya.
     Jadi: deleteApp() dulu, lalu set process.exitCode dan biarkan Node keluar sendiri. */
  const app = initializeApp(firebaseConfig);
  const storage = getStorage(app);
  const selesai = async (kode) => { await deleteApp(app).catch(() => {}); process.exitCode = kode; };
  const objek = ref(storage, `_cek/konektivitas-${Date.now()}.txt`);
  let terunggah = false;

  try {
    console.log("Langkah 1: unggah berkas uji…");
    await uploadBytes(objek, new Blob(["cek konektivitas"], { type: "text/plain" }));
    terunggah = true;
    console.log("  ✅ unggah");

    console.log("Langkah 2: cek metadata…");
    const meta = await getMetadata(objek);
    console.log("  ✅ terbaca, ukuran:", meta.size, "byte");

    console.log("Langkah 3: ambil URL download & baca isinya…");
    // Ini yang dipakai StnkView untuk menampilkan foto — kalau gagal, fotonya tidak akan muncul.
    const url = await getDownloadURL(objek);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`URL download tidak bisa diambil (HTTP ${res.status})`);
    console.log("  ✅ URL download bisa diakses");

    console.log("Langkah 4: list folder _cek…");
    const isi = await listAll(ref(storage, "_cek"));
    console.log("  ✅ folder terbaca, jumlah berkas:", isi.items.length);
    if (isi.items.length > 1) console.log("  ⚠️  ada sisa berkas uji dari jalannya skrip sebelumnya");

    console.log("Langkah 5: hapus berkas uji…");
    await deleteObject(objek);
    terunggah = false;
    console.log("  ✅ hapus");

    console.log("\n" + "═".repeat(60));
    console.log("✅ FIREBASE STORAGE SIAP UNTUK FOTO STNK");
    console.log("═".repeat(60));
    console.log("  Folder tujuan : stnk/<unitId>/<acak>.jpg");
    console.log("  Maks berkas   : 5 MB, image/*");
    console.log("  Unggah        : uploadStnkPhoto(file, unitId)");
    console.log("  Tampilkan     : getStnkPhotoUrl(path)");
    console.log("  Hapus         : deleteStnkPhoto(path)\n");
    await selesai(0);
  } catch (err) {
    const kode = (err && err.code) || "";
    console.error("\n❌ UJI GAGAL:", kode, (err && err.message) || err);

    /* SDK menelan respons server jadi "storage/unknown" yang tidak bisa dipakai membedakan
       "bucket belum ada" dari "ditolak rules" — dua masalah dengan penyelesaian yang jauh
       berbeda. Jadi endpoint REST-nya ditanya langsung: 404 = bucket belum ada, 403 = rules. */
    const status = await probeStatus();
    if (status === 404) console.error(PETUNJUK_BUCKET);
    else if (status === 403 || /unauthorized|unauthenticated/.test(kode)) console.error(RULES);
    else console.error(`\n→ Respons server: HTTP ${status || "?"}\n`);
    if (terunggah) await deleteObject(objek).catch(() => {}); // jangan tinggalkan sampah
    await selesai(1);
  }
}

main().catch((e) => {
  console.error("❌ Error tak terduga:", e);
  process.exitCode = 1;
});
