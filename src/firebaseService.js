/* Helper Firestore + Firebase Storage untuk migrasi dari Supabase.
   Belum dipakai app: App.jsx masih sepenuhnya lewat window.storage (Supabase).

   ══════════════════════════════════════════════════════════════════════════════════
   PERINGATAN CAKUPAN — dicek ke Supabase produksi pada 21 Agustus 2026.

   Berkas ini cuma menangani 4 koleksi: units, users, tasks, expenses. Data Motorell Ops
   TIDAK cuma itu. Kalau migrasi dijalankan apa adanya, yang IKUT pindah:

       units        22   (tabel `units`)
       users         6   (di dalam blob kv, BUKAN tabel)
       tasks        15   (tabel `tasks`)
       expenses     16   (di dalam blob kv, BUKAN tabel)
       ------------------
       total        59 catatan

   dan yang TERTINGGAL DIAM-DIAM:

       attendance  134   (tabel `attendance`) ← paling besar
       media        13   (blob kv)
       lives         3   (blob kv)
       inspections   1   (blob kv)
       extras        1   (blob kv, dasar hitungan bonus)
       verifikasi    1   (tabel `verifikasi`)
       chat          8   (blob kv; tabel `chat` sendiri sudah 0 karena auto-prune)
       ------------------
       total       161 catatan — lebih banyak daripada yang dipindah

   Belum termasuk: bucket Storage `handbook` (PDF), bucket `stnk`, langganan web push, dan
   Edge Function `send-push` (di Firebase ini berarti pindah ke FCM — bukan sekadar salin data).

   Perhatikan juga bentuk datanya beda: tabel `units` Supabase menyimpan SELURUH objek unit di
   satu kolom `data` JSONB, sedangkan getAllUnits() di bawah membaca field Firestore secara
   langsung. Eksporter nanti harus membongkar `row.data` dulu, kalau tidak tiap dokumen jadi
   { data: {...} } bersarang dan seluruh App.jsx tidak akan menemukan fieldnya.

   Jangan jalankan migrasi sebelum koleksi yang tertinggal di atas diputuskan mau diapakan.
   ══════════════════════════════════════════════════════════════════════════════════ */
import { db, storage } from "./firebaseConfig";

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";

import { ref, uploadBytes, getDownloadURL, deleteObject, getMetadata, listAll } from "firebase/storage";

/* ═══════════════ UNITS (motor) ═══════════════ */

export const getAllUnits = async () => {
  try {
    const snapshot = await getDocs(collection(db, "units"));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("❌ Error fetching units:", err);
    return [];
  }
};

export const getUnitById = async (unitId) => {
  try {
    const snapshot = await getDoc(doc(db, "units", unitId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  } catch (err) {
    console.error("❌ Error fetching unit:", err);
    return null;
  }
};

export const getUnitsByStatus = async (status) => {
  try {
    const snapshot = await getDocs(query(collection(db, "units"), where("status", "==", status)));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("❌ Error filtering units by status:", err);
    return [];
  }
};

export const addUnit = async (unitData) => {
  try {
    const docRef = await addDoc(collection(db, "units"), {
      ...unitData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log("✅ Unit added with ID:", docRef.id);
    return docRef.id;
  } catch (err) {
    console.error("❌ Error adding unit:", err);
    throw err;
  }
};

export const updateUnit = async (unitId, unitData) => {
  try {
    await updateDoc(doc(db, "units", unitId), { ...unitData, updated_at: new Date().toISOString() });
    console.log("✅ Unit updated:", unitId);
  } catch (err) {
    console.error("❌ Error updating unit:", err);
    throw err;
  }
};

export const deleteUnit = async (unitId) => {
  try {
    await deleteDoc(doc(db, "units", unitId));
    console.log("✅ Unit deleted:", unitId);
  } catch (err) {
    console.error("❌ Error deleting unit:", err);
    throw err;
  }
};

export const watchUnitsRealtime = (callback) =>
  onSnapshot(collection(db, "units"), (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });

/* ═══════════════ USERS ═══════════════
   Di Supabase, users TIDAK punya tabel — isinya di dalam blob kv `motorell-state-v3`.
   id-nya string buatan sendiri ('u_own', 'kyldr20'), jadi dipakai setDoc(id) bukan addDoc
   supaya id lamanya ikut terbawa; App.jsx mencocokkan me.id ke id-id itu. */

export const getAllUsers = async () => {
  try {
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    return [];
  }
};

export const getUserById = async (userId) => {
  try {
    const snapshot = await getDoc(doc(db, "users", userId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    return null;
  }
};

export const addUser = async (userId, userData) => {
  try {
    await setDoc(doc(db, "users", userId), {
      ...userData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log("✅ User added:", userId);
  } catch (err) {
    console.error("❌ Error adding user:", err);
    throw err;
  }
};

export const updateUser = async (userId, userData) => {
  try {
    await updateDoc(doc(db, "users", userId), { ...userData, updated_at: new Date().toISOString() });
    console.log("✅ User updated:", userId);
  } catch (err) {
    console.error("❌ Error updating user:", err);
    throw err;
  }
};

export const deleteUser = async (userId) => {
  try {
    await deleteDoc(doc(db, "users", userId));
    console.log("✅ User deleted:", userId);
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    throw err;
  }
};

/* ═══════════════ TASKS ═══════════════ */

export const getAllTasks = async () => {
  try {
    const snapshot = await getDocs(collection(db, "tasks"));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("❌ Error fetching tasks:", err);
    return [];
  }
};

export const addTask = async (taskData) => {
  try {
    const docRef = await addDoc(collection(db, "tasks"), {
      ...taskData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log("✅ Task added:", docRef.id);
    return docRef.id;
  } catch (err) {
    console.error("❌ Error adding task:", err);
    throw err;
  }
};

export const updateTask = async (taskId, taskData) => {
  try {
    await updateDoc(doc(db, "tasks", taskId), { ...taskData, updated_at: new Date().toISOString() });
    console.log("✅ Task updated:", taskId);
  } catch (err) {
    console.error("❌ Error updating task:", err);
    throw err;
  }
};

export const deleteTask = async (taskId) => {
  try {
    await deleteDoc(doc(db, "tasks", taskId));
    console.log("✅ Task deleted:", taskId);
  } catch (err) {
    console.error("❌ Error deleting task:", err);
    throw err;
  }
};

/* ═══════════════ EXPENSES ═══════════════
   Sama seperti users: sekarang ada di dalam blob kv, bukan tabel. */

export const getAllExpenses = async () => {
  try {
    const snapshot = await getDocs(collection(db, "expenses"));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("❌ Error fetching expenses:", err);
    return [];
  }
};

export const addExpense = async (expenseData) => {
  try {
    const docRef = await addDoc(collection(db, "expenses"), {
      ...expenseData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log("✅ Expense added:", docRef.id);
    return docRef.id;
  } catch (err) {
    console.error("❌ Error adding expense:", err);
    throw err;
  }
};

export const updateExpense = async (expenseId, expenseData) => {
  try {
    await updateDoc(doc(db, "expenses", expenseId), { ...expenseData, updated_at: new Date().toISOString() });
    console.log("✅ Expense updated:", expenseId);
  } catch (err) {
    console.error("❌ Error updating expense:", err);
    throw err;
  }
};

export const deleteExpense = async (expenseId) => {
  try {
    await deleteDoc(doc(db, "expenses", expenseId));
    console.log("✅ Expense deleted:", expenseId);
  } catch (err) {
    console.error("❌ Error deleting expense:", err);
    throw err;
  }
};

/* ═══════════════ FOTO (STNK, motor, dll) ═══════════════ */

export const uploadPhoto = async (file, folder = "motor-photos") => {
  try {
    const fileName = `${folder}/${Date.now()}-${file.name}`;
    const snapshot = await uploadBytes(ref(storage, fileName), file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log("✅ Photo uploaded:", downloadURL);
    return downloadURL;
  } catch (err) {
    console.error("❌ Error uploading photo:", err);
    throw err;
  }
};

export const deletePhoto = async (photoURL) => {
  try {
    await deleteObject(ref(storage, photoURL));
    console.log("✅ Photo deleted");
  } catch (err) {
    console.error("❌ Error deleting photo:", err);
    throw err;
  }
};

/* ═══════════════ FOTO STNK (pengganti bucket Supabase `stnk`) ═══════════════

   Padanan Firebase dari storage.stnkUpload/stnkSignedUrl/stnkDelete di src/storage.js.
   Bentuk path sengaja dibuat SAMA dengan yang lama — `<unitId>/<acak>.jpg` — cuma diberi awalan
   folder `stnk/`, karena Firebase cuma punya satu bucket per project (tidak ada bucket terpisah
   seperti Supabase). Nilai unit.stnkPath yang sudah tersimpan tetap dikenali: normalisasiPath()
   menambahkan awalannya sendiri kalau belum ada.

   Nama berkas TETAP acak, bukan `${unitId}-${Date.now()}-${file.name}`. Dua alasan konkret:
   (1) App.jsx mengirim Blob hasil dataUrlToBlob() yang TIDAK punya .name, jadi pola itu
       menghasilkan path berakhiran "undefined";
   (2) nama yang gampang ditebak melemahkan satu-satunya penghalang akses di sini (lihat di bawah).

   ⚠️  PERBEDAAN KEAMANAN DENGAN VERSI SUPABASE — bukan detail kecil:
   Supabase memakai bucket privat + signed URL yang kedaluwarsa 1 jam. getDownloadURL() Firebase
   mengembalikan URL bertoken yang BERLAKU SELAMANYA sampai tokennya di-revoke manual di Console.
   Sekali tautannya bocor, foto STNK (nama & alamat pemilik, nomor rangka, nomor mesin) bisa
   dibuka siapa saja tanpa batas waktu. Signed URL yang benar-benar kedaluwarsa butuh
   Admin SDK / Cloud Function dengan service account — tidak bisa dari browser.
   Selama itu belum ada, Security Rules di Firebase Console adalah satu-satunya penjaga. */

const STNK_FOLDER = "stnk";
const STNK_MAX_MB = 5;

// unit.stnkPath lama tersimpan tanpa awalan folder (dulu nama bucket-nya yang jadi namespace).
const normalisasiPath = (p) => (!p ? p : p.startsWith(`${STNK_FOLDER}/`) ? p : `${STNK_FOLDER}/${p}`);

/**
 * Unggah foto STNK ke Firebase Storage.
 * @param {File|Blob} file  berkas gambar (App.jsx mengirim Blob tanpa .name — itu wajar)
 * @param {string} unitId   id unit motor
 * @returns {Promise<string>} path objek, untuk disimpan di unit.stnkPath
 */
export async function uploadStnkPhoto(file, unitId) {
  if (!storage) throw new Error("Firebase Storage belum siap");
  if (!file) throw new Error("Berkas kosong");
  if (!unitId) throw new Error("unitId kosong");
  if (file.type && !file.type.startsWith("image/")) throw new Error("Berkas harus berupa gambar");
  if (file.size > STNK_MAX_MB * 1024 * 1024) throw new Error(`Ukuran foto maksimal ${STNK_MAX_MB}MB`);

  const ext = (file.type || "").split("/")[1] === "png" ? "png" : "jpg";
  const acak = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const filePath = `${STNK_FOLDER}/${unitId}/${acak}.${ext}`;

  await uploadBytes(ref(storage, filePath), file, {
    contentType: file.type || "image/jpeg",
    // Aman di-cache selamanya: nama berkasnya acak, isinya tidak pernah ditimpa.
    cacheControl: "public, max-age=31536000",
  });
  console.log("✅ Foto STNK terunggah:", filePath);
  return filePath;
}

/**
 * Ambil URL foto STNK untuk ditampilkan di <img>.
 * CATATAN: ini URL download bertoken, BUKAN signed URL yang kedaluwarsa — lihat peringatan
 * di atas. Parameter kedaluwarsa sengaja tidak disediakan supaya tidak terkesan ada masa berlaku.
 * @param {string} filePath nilai dari unit.stnkPath
 * @returns {Promise<string|null>} URL, atau null kalau berkasnya tidak ada / tidak boleh diakses
 */
export async function getStnkPhotoUrl(filePath) {
  if (!storage || !filePath) return null;
  try {
    return await getDownloadURL(ref(storage, normalisasiPath(filePath)));
  } catch (err) {
    // storage/object-not-found itu kasus wajar (unit lama, berkas sudah dihapus) — jangan berisik.
    if (err && err.code === "storage/object-not-found") console.warn("Foto STNK tidak ada:", filePath);
    else console.error("❌ Gagal mengambil URL STNK:", err);
    return null;
  }
}

/** Hapus foto STNK. Dipakai saat "Ganti foto STNK" supaya berkas lama tidak jadi sampah. */
export async function deleteStnkPhoto(filePath) {
  if (!storage || !filePath) return;
  try {
    await deleteObject(ref(storage, normalisasiPath(filePath)));
    console.log("✅ Foto STNK dihapus:", filePath);
  } catch (err) {
    if (err && err.code === "storage/object-not-found") return; // sudah tidak ada = tujuan tercapai
    console.error("❌ Gagal menghapus foto STNK:", err);
    throw err;
  }
}

/* ── Adaptor bentuk-lama ──────────────────────────────────────────────────────
   Tanda tangan & nilai balik PERSIS window.storage.stnk* di src/storage.js, supaya integrasi
   di App.jsx cukup ganti pemanggilnya tanpa mengubah alur if (!up.ok) di sekitarnya. */

export const stnkUpload = async (unitId, blob, ext) => {
  try {
    const path = await uploadStnkPhoto(blob, unitId);
    return { ok: true, path };
  } catch (e) {
    console.error("stnkUpload error:", e);
    return { ok: false, error: String((e && e.message) || e) };
  }
};

export const stnkSignedUrl = (path) => getStnkPhotoUrl(path);

export const stnkDelete = async (path) => {
  try {
    await deleteStnkPhoto(path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
};

/**
 * Uji konektivitas Firebase Storage: unggah → cek metadata → list → hapus.
 * Dipakai dari console browser. Untuk terminal pakai `npm run test:firebase`
 * (skrip itu berdiri sendiri karena firebaseConfig.js membaca import.meta.env yang tidak ada di Node).
 */
export async function testFirebaseStorage() {
  if (!storage) {
    console.error("❌ Firebase Storage belum siap");
    return false;
  }
  try {
    console.log("\n🧪 Menguji Firebase Storage…\n");

    console.log("Langkah 1: unggah berkas uji…");
    const testRef = ref(storage, `_cek/konektivitas-${Date.now()}.txt`);
    await uploadBytes(testRef, new Blob(["cek konektivitas"], { type: "text/plain" }));
    console.log("  ✅ unggah");

    console.log("Langkah 2: cek berkas ada…");
    const metadata = await getMetadata(testRef);
    console.log("  ✅ terbaca, ukuran:", metadata.size, "byte");

    console.log("Langkah 3: list folder _cek…");
    const isi = await listAll(ref(storage, "_cek"));
    console.log("  ✅ folder terbaca, jumlah berkas:", isi.items.length);

    console.log("Langkah 4: hapus berkas uji…");
    await deleteObject(testRef);
    console.log("  ✅ hapus");

    console.log("\n" + "═".repeat(60));
    console.log("✅ FIREBASE STORAGE SIAP");
    console.log("═".repeat(60));
    console.log("  Bucket   :", storage.app.options.storageBucket);
    console.log("  Folder   :", `${STNK_FOLDER}/<unitId>/<acak>.jpg`);
    console.log("  Maks     :", STNK_MAX_MB, "MB, image/*\n");
    return true;
  } catch (err) {
    console.error("\n❌ UJI FIREBASE STORAGE GAGAL");
    console.error("Error:", (err && err.code) || "", (err && err.message) || err);
    console.error("\nPeriksa:");
    console.error("1. Storage sudah diaktifkan di Firebase Console (Build → Storage → Get started)");
    console.error("2. Security Rules mengizinkan operasinya — app ini TIDAK punya auth, jadi rules");
    console.error("   bawaan (request.auth != null) akan selalu menolak");
    console.error("3. VITE_FIREBASE_STORAGE_BUCKET benar (project ini: motorell-ops.firebasestorage.app)\n");
    return false;
  }
}

/* ═══════════════ IMPOR MASSAL ═══════════════
   writeBatch dibatasi 500 operasi per commit oleh Firestore, jadi dipecah per 500.
   Data sekarang jauh di bawah itu, tapi `attendance` (134 baris) dan blob lama gampang
   menembusnya kalau nanti ikut dimigrasi. */

const BATCH_LIMIT = 500;

async function commitInBatches(items, isiSatu) {
  let count = 0;
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + BATCH_LIMIT)) {
      isiSatu(batch, item);
      count++;
    }
    await batch.commit();
  }
  return count;
}

export const bulkImportUnits = async (unitsData) => {
  try {
    const count = await commitInBatches(unitsData || [], (batch, unit) => {
      // Id lama dipertahankan kalau ada: App.jsx memakainya di expenses.unitId,
      // inspections.unitId, dan path berkas STNK. Id acak akan memutus semua kaitan itu.
      const docRef = unit.id ? doc(db, "units", String(unit.id)) : doc(collection(db, "units"));
      batch.set(docRef, { ...unit, created_at: unit.created_at || new Date().toISOString(), updated_at: new Date().toISOString() });
    });
    console.log(`✅ ${count} units imported`);
    return count;
  } catch (err) {
    console.error("❌ Error bulk importing units:", err);
    throw err;
  }
};

export const bulkImportUsers = async (usersData) => {
  try {
    const count = await commitInBatches(usersData || [], (batch, user) => {
      const userId = String(user.id || user.email);
      batch.set(doc(db, "users", userId), { ...user, created_at: user.created_at || new Date().toISOString(), updated_at: new Date().toISOString() });
    });
    console.log(`✅ ${count} users imported`);
    return count;
  } catch (err) {
    console.error("❌ Error bulk importing users:", err);
    throw err;
  }
};

export const bulkImportTasks = async (tasksData) => {
  try {
    const count = await commitInBatches(tasksData || [], (batch, task) => {
      const docRef = task.id ? doc(db, "tasks", String(task.id)) : doc(collection(db, "tasks"));
      batch.set(docRef, { ...task, created_at: task.created_at || new Date().toISOString(), updated_at: new Date().toISOString() });
    });
    console.log(`✅ ${count} tasks imported`);
    return count;
  } catch (err) {
    console.error("❌ Error bulk importing tasks:", err);
    throw err;
  }
};

export const bulkImportExpenses = async (expensesData) => {
  try {
    const count = await commitInBatches(expensesData || [], (batch, expense) => {
      // Id expense dipertahankan supaya menjalankan impor dua kali TIDAK menggandakan data
      // (set by id = idempoten). addDoc akan bikin salinan baru tiap kali dijalankan.
      const docRef = expense.id ? doc(db, "expenses", String(expense.id)) : doc(collection(db, "expenses"));
      batch.set(docRef, { ...expense, created_at: expense.created_at || new Date().toISOString(), updated_at: new Date().toISOString() });
    });
    console.log(`✅ ${count} expenses imported`);
    return count;
  } catch (err) {
    console.error("❌ Error bulk importing expenses:", err);
    throw err;
  }
};

/* ═══════════════ VERIFIKASI & TES ═══════════════ */

export const getCollectionCounts = async () => {
  try {
    const collections = ["units", "users", "tasks", "expenses"];
    const counts = {};
    for (const collName of collections) {
      try {
        const snapshot = await getDocs(collection(db, collName));
        counts[collName] = snapshot.size;
      } catch (err) {
        counts[collName] = 0; // koleksi belum ada
      }
    }
    console.log("📊 Collection counts:", counts);
    return counts;
  } catch (err) {
    console.error("❌ Error getting counts:", err);
    return null;
  }
};

export const testFirebaseConnection = async () => {
  try {
    const testRef = doc(db, "_test", "_test");
    await setDoc(testRef, { timestamp: new Date().toISOString() });
    await deleteDoc(testRef);
    console.log("✅ Firebase connection verified");
    return true;
  } catch (err) {
    console.error("❌ Firebase connection failed:", err);
    return false;
  }
};

// Diteruskan supaya pemakai cukup impor dari satu berkas ini.
export { db, storage };

export default {
  uploadStnkPhoto,
  getStnkPhotoUrl,
  deleteStnkPhoto,
  stnkUpload,
  stnkSignedUrl,
  stnkDelete,
  testFirebaseStorage,
  testFirebaseConnection,
};
