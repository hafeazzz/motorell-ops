# Migrasi Pengeluaran KV → `transaksi_detail`

## Ringkasan

Memindahkan rincian pengeluaran unit dari `state.expenses` (di dalam blob `kv`, key
`motorell-state-v3`) ke tabel `transaksi_detail` di Supabase.

**32 entri, 12 unit, total Rp 11.297.327.** Semuanya lolos validasi.

Migrasinya **menyalin**, tidak memindahkan. Data KV tidak disentuh sama sekali.

---

## PENTING: kenapa BAGIAN 3 belum dikerjakan

Rencana asli meminta `UnitDetailModal` berhenti membaca `state.expenses` dan menggantinya dengan
`<TransaksiSection />`. **Itu belum dikerjakan, dan sengaja.** Kalau dilakukan sekarang, hasilnya
adalah bug keuangan yang diam-diam.

`state.expenses` bukan cuma dipakai untuk daftar di layar. Dia adalah sumber angka modal dan
profit di SELURUH app:

| Tempat | Baris di `src/App.jsx` | Dampak |
|---|---|---|
| `expByUnit()` | 1194 | fungsi dasar; dipanggil 10 tempat |
| `unitProfit()` | 1239 | profit bersih per unit |
| `estimateProfit()` | 1214, 1221 | estimasi unit siap jual |
| Beranda | 1342, 1344, 1346 | profit bulan ini |
| Kartu Keuangan | 1587, 1742 | modal + profit per kartu |
| Arsip | 2254, 2273 | profit + balik modal investor |
| `monthlyReport()` | 2087 | Laporan bulanan |
| Ekspor Excel / CSV | 2131, 2145 | angka yang diunduh |

Kalau layar diganti ke `transaksi_detail` tapi hitungan di atas tetap membaca `state.expenses`:

- Layanan baru yang diinput lewat UI baru **tidak akan mengubah profit sama sekali**. Kelihatan
  tercatat, tapi tak berpengaruh ke modal, profit bersih, Laporan, maupun ekspor Excel.
- Setelah migrasi, kedua sumber berisi 32 entri yang sama. Kalau nanti `expByUnit` diarahkan ke
  tabel baru tanpa menghapus KV lebih dulu, angkanya **terhitung dua kali**.

Ada juga halangan teknis: `state.expenses` itu array sinkron di memori, dibaca saat render.
`transaksi_detail` diambil async lewat jaringan. `unitProfit`, `estimateProfit`, dan
`monthlyReport` semuanya fungsi murni yang dipanggil di tengah render — tidak bisa tiba-tiba
`await`. Jadi peralihan penuh **bukan find-replace**, melainkan memuat `transaksi_detail` ke dalam
state app saat boot lalu menjaganya lewat realtime, persis pola yang sudah dipakai tabel `units`
(lihat `storage.js` → `unitList`/`unitSubscribe`, dan `App.jsx:628`).

### Urutan yang benar

1. **Salin datanya** — skrip di panduan ini. Aman, tidak merusak apa pun. ← *sudah siap*
2. Muat `transaksi_detail` ke state app saat boot + realtime (tiru pola tabel `units`).
3. Arahkan SEMUA pembaca ke sumber baru: `expByUnit` + tiga salinan `expFor` (baris 2087, 2131, 2145).
4. Arahkan SEMUA penulis: expense otomatis "Cek unit" (1709), tambah/edit (1725), hapus (1814),
   hapus berantai saat unit dihapus (1815), dan alur Inspeksi → beli (3164).
5. Bandingkan total: harus tetap **Rp 11.297.327**.
6. Baru setelah itu KV `state.expenses` boleh dikosongkan.

Langkah 1 boleh dijalankan sekarang. Langkah 2–4 pekerjaan tersendiri; kalau mau, bisa dikerjakan
menyusul.

---

## Sebelum migrasi

- [ ] Konfirmasi backup Supabase aktif (Dashboard → Project Settings → Backups). Migrasi ini
      hanya menambah baris ke tabel yang masih kosong, jadi risikonya kecil — tapi tetap cek.
- [ ] Jalankan dry run dan tinjau ringkasan per unit di bawah.
- [ ] Pastikan `transaksi_detail` memang masih kosong (atau isinya cuma hasil migrasi sebelumnya).

Tidak ada staging di project ini — dry run adalah jaring pengaman utamanya.

## Menjalankan

```bash
# 1. Dry run (default, tidak menulis apa pun)
node scripts/migrate-expenses-to-transaksi.js

# 2. Dry run + lihat SQL setaranya
node scripts/migrate-expenses-to-transaksi.js --sql

# 3. Kalau ringkasannya sudah benar — tulis beneran
node scripts/migrate-expenses-to-transaksi.js --execute
```

**Aman diulang.** Tiap baris hasil migrasi diberi penanda `[migrasi:<id-expense-asal>]` di kolom
`catatan`. Sebelum menulis, skrip membaca penanda yang sudah ada dan melewati yang sudah pernah
masuk. Menjalankan `--execute` dua kali tidak menggandakan data.

### Hasil dry run saat ini

```
Total entri dibaca : 32
Lolos validasi     : 32
Dilewati           : 0
Total nilai        : Rp 11.297.327  (12 unit)
```

## Setelah migrasi

- [ ] Hitung baris: `select count(*) from transaksi_detail;` → harus **32**
- [ ] Cocokkan total: `select sum(harga) from transaksi_detail;` → harus **11297327**
- [ ] Cek satu unit di Supabase, bandingkan dengan "Rincian transaksi" di app (harus sama persis)
- [ ] **Jangan** hapus `state.expenses` dulu — app masih memakainya untuk semua hitungan profit

Menguji `TransaksiSection` di browser butuh komponennya disambungkan lebih dulu; lihat
`INTEGRATION_STEPS.md` bagian 4. Selama langkah 2–4 di atas belum dikerjakan, pasang komponennya
sebagai bagian **tambahan** di samping "Rincian transaksi" yang lama, jangan menggantikannya.

## Rencana mundur

Karena migrasinya menyalin, membatalkan itu gampang:

```sql
-- Hapus hanya baris hasil migrasi (yang punya penanda). Data asli di KV tidak pernah disentuh.
delete from transaksi_detail where catatan like '%[migrasi:%';
```

App tetap jalan normal sepanjang waktu — semua hitungan masih membaca `state.expenses`. Tidak
perlu restore dari backup, dan tidak ada waktu mati.

## Batasan yang diketahui

- **Pemetaan kategori itu lossy.** Pengeluaran lama punya 5 kategori (`service`, `jasa`, `bensin`,
  `sparepart`, `pajak`), sedangkan `jenis_layanan` cuma punya Servis / Perawatan / Perbaikan /
  Modifikasi / Pembersihan. `bensin` dan `pajak` bahkan bukan "layanan". Pemetaannya:

  | Kategori lama | Jumlah | → jenis_layanan |
  |---|---|---|
  | `service` | 8 | Servis |
  | `sparepart` | 10 | Perbaikan |
  | `jasa` | 10 | Servis |
  | `bensin` | 1 | Perawatan |
  | `pajak` | 3 | Servis |

  Karena lossy, **kategori aslinya selalu ikut ditulis** di kolom `catatan` sebagai
  `[kategori: Pajak]`. Tidak ada informasi yang hilang, dan pemetaannya bisa diperbaiki belakangan.

- **Status semua `selesai`.** Pengeluaran lama adalah kejadian yang sudah terjadi.
  `tanggal_selesai` diisi sama dengan `tanggal_mulai`.

- **Tidak ada riwayat perubahan.** Sistem lama tidak menyimpannya; riwayat dimulai dari sini.

- **`created_by` diisi id user app** (mis. `u_own`), bukan UUID auth — kolomnya bertipe TEXT jadi
  ini valid, tapi bukan foreign key ke user mana pun.

- **Tidak ada BEGIN/COMMIT.** PostgREST tidak punya transaksi lintas request, jadi tidak ada
  ROLLBACK yang bisa dipanggil dari skrip. Satu INSERT berisi banyak baris tetap atomik per
  pernyataan; kalau satu batch gagal, skrip mengulanginya baris-per-baris agar baris bermasalah
  terisolasi dan sisanya tetap masuk. Untuk atomicity penuh perlu function/RPC di sisi Postgres.

## Koreksi atas asumsi di rencana awal

Beberapa hal di rencana tidak cocok dengan isi project sebenarnya:

| Anggapan | Kenyataan |
|---|---|
| "kunci KV `state.*`" | hanya ada 1 kunci berisi expenses: `motorell-state-v3` (kunci lain: `motorell-handbook-meta`, `motorell-active-inspections`) |
| "`state.expenses` per unit" | satu array datar; unit ditentukan lewat field `unitId` |
| "`unit_id` dari key `unit_xxxxx`" | tidak ada key seperti itu; `unitId` berupa TEXT pendek, mis. `7etfa59` |
| `expense.description` / `.nama` | field sebenarnya `note` |
| `expense.notes` | field sebenarnya `note` (yang sama) |
| `expense.createdBy` | field sebenarnya `by` |
| "transaksi.ts bikin `createClient()` kedua" | tidak pernah terjadi — `transaksi.ts` sudah mengimpor klien yang sama dari `../../storage`; di seluruh `src/` cuma ada **satu** `createClient` (`storage.js:14`) |
| "`UnitDetailModal.tsx`" | `UnitDetailModal` ada inline di `src/App.jsx`, bukan berkas sendiri |
| "`const [expenses, setExpenses] = useState()`" | tidak ada; komponennya membaca `state.expenses.filter(...)` (baris 1779) |

Bentuk expense yang sebenarnya:

```js
{ id, unitId, cat, amount, note, by, date }
```
