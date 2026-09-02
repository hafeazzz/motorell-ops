# Env var Firebase di Vercel

`.env.local` tidak ikut ter-commit (pola `*.local` di `.gitignore`), jadi build di Vercel **tidak
punya** nilai-nilai ini. Tanpa diset manual, `initializeApp()` jalan dengan `undefined` dan
Firebase gagal.

`src/firebaseConfig.js` sudah dibuat berisik untuk kasus ini — kalau ada yang kosong, console
menampilkan `🔥 Firebase env belum lengkap: ...` alih-alih error Firebase yang membingungkan.

## Nilai untuk project ini

Diambil dari konfigurasi Firebase project `motorell-ops` (sama persis dengan `.env.local`):

| Name | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | `AIzaSyDcxirUQUVc6F6MPbZz4V6tLorI0eH4J9I` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `motorell-ops.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `motorell-ops` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `motorell-ops.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `309888563776` |
| `VITE_FIREBASE_APP_ID` | `1:309888563776:web:b8f0cc53b0ef550aad3da5` |

Perhatikan `storageBucket` berakhiran **`.firebasestorage.app`**, bukan `.appspot.com`. Project
Firebase yang dibuat belakangan memakai domain baru; menyalin pola `.appspot.com` dari tutorial
lama bikin upload gagal.

## Langkah

1. <https://vercel.com/dashboard> → project **motorell-ops**
2. **Settings → Environment Variables**
3. Tambahkan keenam variabel di atas. Centang **Production, Preview, dan Development** —
   preview deploy yang tidak kebagian env akan gagal dengan cara yang sama.
4. **Deployments** → deploy terakhir → **⋯ → Redeploy**. Env var baru **tidak** berlaku ke build
   yang sudah jadi.

## Cek

Buka <https://motorellops.com> → DevTools Console.

- Tidak ada `🔥 Firebase env belum lengkap` → env-nya kebaca.
- Log `🔥 Firebase config loaded` **tidak** muncul di produksi — memang sengaja, log itu
  cuma jalan saat `import.meta.env.DEV`. Ketiadaannya bukan tanda gagal.

Cara pasti: jalankan `await testMigrationSetup()` dari `src/migrationScript.js`.

## Soal keamanan

API key Firebase Web **bukan rahasia**. Memang dirancang ikut terkirim di bundle browser, persis
seperti anon key Supabase yang sudah ada di `src/storage.js` sekarang. Menaruhnya di env var itu
soal kerapian konfigurasi, bukan kerahasiaan.

Pengamanan sebenarnya ada di **Firestore Security Rules** dan **Storage Rules**. Keduanya belum
dibuat. Kalau Firestore masih "test mode", siapa pun yang punya API key — artinya siapa pun yang
membuka aplikasinya — bisa membaca dan menulis seluruh database. Itu harus beres sebelum
Firebase dipakai sungguhan di produksi.

Perlu diingat juga: app ini **tidak punya sistem auth** (login = pilih user + cek password di
sisi klien). Jadi Security Rules yang berbasis `request.auth` tidak akan bisa dipakai sampai
Firebase Auth benar-benar dipasang.
