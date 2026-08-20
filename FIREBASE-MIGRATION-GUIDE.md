# Panduan migrasi Firebase

> Namanya sengaja `FIREBASE-MIGRATION-GUIDE.md`, bukan `MIGRATION-GUIDE.md`, karena di repo ini
> sudah ada `MIGRATION_GUIDE.md` — isinya migrasi yang sama sekali beda (pengeluaran KV →
> `transaksi_detail`, masih di dalam Supabase). Dua berkas yang cuma beda `-` dan `_` itu jebakan.

## Isi data (dicek ke produksi, 21 Agustus 2026)

**Ikut pindah — 59 catatan:** units 22 · users 6 · tasks 15 · expenses 16

**Tertinggal — 161 catatan:** attendance 134 · media 13 · chat 8 · lives 3 · inspections 1 ·
extras 1 · verifikasi 1

Plus bucket `handbook`, bucket `stnk`, langganan web push, dan Edge Function `send-push`.

**Yang tertinggal lebih banyak daripada yang pindah.** Jangan matikan Supabase sampai ini
diputuskan. `extras` cuma 1 baris tapi itu dasar hitungan bonus tim (`saleBonusFor`) —
menghilangkannya mengubah angka extra cash.

## Masalah yang menghambat

### 1. Bentuk data (SUDAH DITANGANI di export-queries.md)

Tabel `units` menyimpan seluruh objek unit di satu kolom `data` JSONB. Isi `data` itu **sudah**
bentuk yang dibaca `App.jsx` — jadi ekspor kolom `data` utuh, jangan dibongkar per field.

Draf query awal membongkarnya dan menyebut nama-nama yang tidak ada (`fullName`, `stnkPhotoUrl`,
`photoUrl`, `nominal_dp`, `notes`, `maintainCost`) sambil menjatuhkan 13 field yang benar-benar
ada. Pakai `export-queries.md`, bukan draf itu.

Gejala kalau salah: motor muncul sebagai `{ data: {...} }` dan seluruh tampilan kosong —
tanpa satu pun pesan error.

### 2. Env var Vercel

`.env.local` tidak ikut ter-commit, jadi produksi tidak punya kredensial Firebase. Lihat
`VERCEL-ENV-SETUP.md`. Tanpa itu Firebase diinisialisasi dengan `undefined`.

### 3. Jebakan nama `storage`

Ada dua objek bernama `storage` (Firebase vs Supabase). Salah impor tidak error, cuma menulis ke
backend yang salah. Lihat `STORAGE-NAMING-TRAP.md`.

## Urutan langkah

1. **Ekspor** — jalankan 4 query di `export-queries.md`, simpan ke `data-export/`.
2. **Validasi** — `validateAllData({ units, users, tasks, expenses })` di console browser.
   Jangan lanjut kalau masih ada error.
3. **Impor** — `migrateDataToFirebase(data)` dari `src/migrationScript.js`. Impornya idempoten
   (set by id), jadi aman diulang.
4. **Cocokkan jumlah** — 22 / 6 / 15 / 16 di Firebase Console.
5. **Baru ubah App.jsx** — ini bagian terbesar dan belum dikerjakan sama sekali. Lihat catatan
   di bawah.
6. **Set env Vercel**, redeploy, uji produksi.

## Soal langkah 5 — jangan diremehkan

`App.jsx` tidak pernah memanggil Supabase langsung; semuanya lewat `window.storage`
(`src/storage.js`). Itu kabar baik: yang perlu ditulis ulang **satu berkas**, bukan 5.000 baris
App.jsx.

Tapi `src/storage.js` bukan cuma CRUD. Yang harus ada padanannya di Firebase:

| Bagian | Sekarang | Di Firebase |
|---|---|---|
| blob kv | tabel `kv` + Realtime | dokumen tunggal + `onSnapshot` |
| units / attendance / tasks / verifikasi | tabel + Realtime per tabel | koleksi + `onSnapshot` |
| chat | tabel append-only + prune | koleksi + aturan hapus |
| handbook PDF | bucket Storage | Firebase Storage |
| foto STNK | bucket privat + signed URL | Firebase Storage + Security Rules |
| web push | Edge Function `send-push` | **tulis ulang ke FCM** |
| fallback offline | localStorage | tetap |

Baris terakhir bukan migrasi data — itu fitur yang harus dibangun ulang.

## Rencana mundur

Selama App.jsx belum diubah, tidak ada yang perlu dibatalkan: Supabase tetap jadi sumber
kebenaran dan Firebase cuma berisi salinan. Kalau App.jsx sudah diubah, mundurnya =
`git revert` commit itu — data di Supabase tidak pernah dihapus skrip mana pun.

**Jangan hapus apa pun di Supabase sampai Firebase betul-betul dipakai dan terbukti jalan.**

## Daftar periksa

- [ ] 4 query ekspor dijalankan, hasilnya tersimpan di `data-export/`
- [ ] `validateAllData()` lolos tanpa error
- [ ] Jumlah cocok: 22 / 6 / 15 / 16
- [ ] Firestore aktif, Security Rules diputuskan (jangan biarkan test mode di produksi)
- [ ] Impor selesai, jumlah di Console cocok
- [ ] Diputuskan mau diapakan 161 catatan yang tertinggal
- [ ] `src/storage.js` ditulis ulang (langkah terbesar)
- [ ] Web push dipindah ke FCM, atau diterima hilang dulu
- [ ] 6 env var diset di Vercel
- [ ] Produksi diuji: tambah unit, absen, chat, laporan, unduh Excel
- [ ] Supabase dibiarkan hidup minimal beberapa minggu sebagai cadangan
