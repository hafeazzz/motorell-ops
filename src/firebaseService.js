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

import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

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
