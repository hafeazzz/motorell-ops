/* Inisialisasi Firebase. Nilainya dari .env.local (lihat .env.example).
   CATATAN: .env.local tidak ikut ter-commit, jadi variabel yang sama HARUS diset juga di
   Vercel → Project Settings → Environment Variables. Kalau tidak, build produksi jalan dengan
   nilai undefined dan Firebase gagal dengan pesan yang membingungkan. */
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Gagal-nya dibuat berisik: tanpa ini, env yang belum diset baru ketahuan sebagai error Firebase
// yang tidak jelas jauh di kemudian hari.
const kurang = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
if (kurang.length) {
  console.error("🔥 Firebase env belum lengkap:", kurang.join(", "), "— cek .env.local / env di Vercel.");
} else if (import.meta.env.DEV) {
  // Cuma di dev; console produksi tidak perlu ikut berisik tiap kali app dibuka.
  console.log("🔥 Firebase config loaded:", { projectId: firebaseConfig.projectId, authDomain: firebaseConfig.authDomain });
}

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
/* HATI-HATI soal nama: ini Firebase Storage, BEDA dari src/storage.js (lapisan Supabase yang
   dipakai seluruh app lewat window.storage). Selama masa migrasi keduanya hidup berdampingan —
   impor yang tertukar tidak akan error, cuma menulis ke tempat yang salah. */
export const storage = getStorage(app);
export const auth = getAuth(app);

export default app;
