# Setup bucket STNK

Fitur foto STNK butuh satu bucket Storage. **Belum ada** — buat dulu, kalau tidak setiap
penyimpanan unit baru akan gagal dengan "Bucket not found".

## 1. Buat bucket

Supabase Dashboard → **Storage** → **New bucket**

| Isian | Nilai |
|---|---|
| Name | `stnk` |
| Public bucket | **NONAKTIF** (biarkan privat) |
| File size limit | 5 MB |
| Allowed MIME types | `image/*` |

### Kenapa privat, bukan publik

STNK memuat **nama dan alamat pemilik, nomor rangka, dan nomor mesin**. Bucket publik berarti
URL-nya permanen dan bisa dibuka siapa saja yang pernah melihatnya — sekali tersebar, selamanya
terbuka. Kode ini memakai signed URL yang kedaluwarsa dalam 1 jam, plus nama objek acak
(`<unitId>/<acak>.jpg`) supaya tidak bisa ditebak.

Jujur soal batasnya: anon key ikut terkirim di dalam bundle browser, jadi siapa pun yang
membukanya bisa membuat signed URL sendiri. Ini **bukan** pengamanan sungguhan — cuma menghindari
tautan permanen yang gampang tersebar. Pengamanan sebenarnya perlu Supabase Auth + policy RLS per
user, yang saat ini belum ada di app (login masih pilih-user + cek password di sisi klien).

## 2. Policy

Ikuti pola tabel lain di project ini: izinkan semua, kontrolnya di aplikasi.
Jalankan di **SQL Editor**:

```sql
-- Baca (perlu supaya createSignedUrl bisa jalan)
drop policy if exists "stnk read" on storage.objects;
create policy "stnk read" on storage.objects
  for select using (bucket_id = 'stnk');

-- Unggah
drop policy if exists "stnk insert" on storage.objects;
create policy "stnk insert" on storage.objects
  for insert with check (bucket_id = 'stnk');

-- Hapus (dipakai saat mengganti foto, supaya berkas lama tidak jadi sampah)
drop policy if exists "stnk delete" on storage.objects;
create policy "stnk delete" on storage.objects
  for delete using (bucket_id = 'stnk');
```

## 3. Cek

Tambah satu unit lewat **Keuangan → +**. Kalau berhasil, di Storage → `stnk` akan muncul folder
bernama id unit berisi satu berkas `.jpg`.

Kalau muncul **"Bucket not found"** → bucketnya belum dibuat (langkah 1).
Kalau muncul **"new row violates row-level security policy"** → policy-nya belum dipasang (langkah 2).

## Catatan

- Foto dikompres ke lebar maks 1600px, kualitas 0.8, sebelum diunggah. Lebih besar dan lebih
  bening daripada foto motor biasa (640px/0.55) supaya tulisan di STNK tetap kebaca. Batas 5MB
  berlaku ke berkas asli yang dipilih, sebelum dikompres.
- **20 unit yang sudah ada tidak punya foto STNK.** Kewajiban ini hanya berlaku untuk unit BARU —
  data lama tidak diutak-atik. Di Detail unit, unit lama menampilkan peringatan kuning beserta
  tombol untuk melengkapi.
- Foto disimpan di Storage, bukan base64 di dalam baris unit. Payload tabel `units` sudah ~3,9 MB
  untuk 20 unit dan ditarik ulang penuh tiap ada perubahan realtime; menaruh STNK di situ akan
  melipatgandakannya di tiap sinkronisasi.
