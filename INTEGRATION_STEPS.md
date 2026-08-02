# Integrasi Riwayat Layanan (`transaksi_detail`)

## 0. Baca ini dulu — tidak ada data yang hilang

Brief awal menyebut "database rusak, tabel `transaksi_detail` hilang". Hasil pengecekan
ke database dan ke seluruh riwayat git: **tabel itu tidak pernah ada di project ini**, jadi
tidak ada yang hilang. Ini fitur baru, bukan pemulihan.

Yang tampil sebagai **"Rincian transaksi"** di Detail Unit selama ini adalah `state.expenses`
di dalam blob `kv` (key `motorell-state-v3`) — **bukan** tabel database. Saat diperiksa isinya
utuh: **32 entri di 12 unit**. Tidak ada yang perlu dipulihkan.

Artinya `transaksi_detail` berdiri **berdampingan** dengan pengeluaran yang sudah ada, bukan
menggantikannya. Kalau maksudnya memang mengganti, itu pekerjaan migrasi terpisah — jangan
dikerjakan diam-diam lewat integrasi ini.

## 1. Status database (sudah terverifikasi)

| Tabel | Ada | Baris | Catatan |
|---|---|---|---|
| `transaksi_detail` | ya | 0 | kolom cocok 100% dengan spesifikasi |
| `jenis_layanan` | ya | 5 | Servis, Perawatan, Perbaikan, Modifikasi, Pembersihan |
| `units` | ya | 18 | `id` bertipe TEXT |

Kolom `transaksi_detail` yang terkonfirmasi ada: `id`, `unit_id`, `jenis_layanan_id`,
`deskripsi`, `harga`, `catatan`, `status`, `tanggal_mulai`, `tanggal_selesai`, `created_at`,
`updated_at`, `is_deleted`. Foreign key ke `jenis_layanan` terbaca oleh PostgREST, jadi embed
`jenis_layanan(...)` jalan.

**Tidak ada langkah SQL yang perlu dijalankan.** Databasenya sudah siap.

## 2. Berkas yang ditambahkan

```
src/
├── lib/supabase/transaksi.ts              ← query + tipe
├── components/UnitDetail/TransaksiSection.tsx  ← komponen daftar
└── storage.js                             ← DIUBAH: menambah `export { supabase }`
```

Path-nya diberi awalan `src/` karena semua kode project ini ada di dalam `src/`.

## 3. Tiga penyesuaian dari spesifikasi (wajib, kalau tidak file-nya tidak jalan)

### a. `@/lib/supabaseClient` → `../../storage`

Project ini **tidak punya alias `@/`** (tidak ada `resolve.alias` di `vite.config.js`) dan
**tidak punya berkas `lib/supabaseClient`**. Klien Supabase-nya adalah `const` privat di dalam
`src/storage.js`.

Karena itu `src/storage.js` sekarang mengekspor kliennya:

```js
export { supabase };
```

dan `transaksi.ts` mengimpornya relatif. **Jangan** `createClient()` lagi di berkas baru —
dua klien berarti dua koneksi realtime ke project yang sama.

Kalau nanti mau memakai `@/`, tambahkan di `vite.config.js`:

```js
resolve: { alias: { "@": path.resolve(__dirname, "./src") } }
```

lalu impornya boleh diganti jadi `@/storage`.

### b. styled-jsx → kelas tema yang sudah ada

`styled-jsx` **tidak terpasang** (cek `package.json`: hanya `@supabase/supabase-js`,
`lucide-react`, `react`, `react-dom`, `recharts`). Menulis `<style jsx>` tanpa plugin Babel-nya
tidak akan ter-scope — CSS-nya bocor jadi global dan React memunculkan peringatan atribut.

Yang dipakai: kelas tema milik app sendiri (`s-surface`, `s-border`, `s-muted`, `s-soft`,
`s-input`, `tg-*`) yang semuanya bersandar pada CSS variable di `.mr-app`, ditambah Tailwind
(dimuat via CDN di `index.html`). Hasilnya sesuai tujuan spesifikasi: **nol warna hardcoded**,
ikut light/dark otomatis, dan tanpa dependensi baru.

Peta warna status memakai kelas yang sudah ada:

| Status | Kelas | Warna |
|---|---|---|
| `pending` | `tg-amber` | kuning |
| `proses` | `tg-blue` | biru |
| `selesai` | `tg-emerald` | hijau |
| `batal` | `tg-rose` | merah |

### c. TypeScript di project JavaScript

Project ini **tidak punya `tsconfig.json`** dan **tidak punya paket `typescript`**. Vite tetap
mengompilasi `.ts`/`.tsx` lewat esbuild, jadi berkasnya **jalan** — tapi **tidak ada
pengecekan tipe** yang berjalan saat build. Tipe di sini berfungsi sebagai dokumentasi dan
bantuan editor, bukan jaring pengaman.

Kalau mau pengecekan tipe betulan:

```bash
npm i -D typescript
npx tsc --init --jsx react-jsx --allowJs --noEmit
npx tsc --noEmit    # jalankan manual; build Vite tidak memanggil ini
```

## 4. Menyambungkan ke Detail Unit

`UnitDetailModal` ada di `src/App.jsx`. Tambahkan impor di bagian atas berkas:

```js
import TransaksiSection from "./components/UnitDetail/TransaksiSection";
```

Lalu render di dalam `UnitDetailModal` — letak yang masuk akal tepat sebelum blok
"Rincian transaksi" yang sudah ada:

```jsx
<TransaksiSection unitId={unit.id} />
```

**Syarat wajib:** komponen harus berada di dalam pohon `.mr-app`. Variabel tema (`--surface`,
`--border`, dll.) dideklarasikan di root `.mr-app`, jadi apa pun yang dirender di luar itu
(mis. lewat `createPortal` ke `document.body`) akan keluar transparan. Dirender dari dalam
`UnitDetailModal` sudah memenuhi syarat ini.

> Catatan pola: `CLAUDE.md` menyebut komponen baru sebaiknya inline di `App.jsx`, kecuali
> benar-benar berdiri sendiri. `TransaksiSection` termasuk yang berdiri sendiri (tidak
> mengimpor apa pun dari `App.jsx`, mengambil datanya sendiri), sama seperti
> `SearchResultsOverlay` — jadi berkas terpisah di sini konsisten dengan pola yang ada.

## 5. Menguji

```bash
npm run build     # harus lolos
npm run dev       # buka http://localhost:5173/
```

Di browser: **Keuangan → klik satu motor → Detail unit**.

| Yang diuji | Yang diharapkan |
|---|---|
| Buka detail unit | Muncul skeleton sebentar, lalu "Belum ada riwayat layanan." (tabel masih kosong) |
| Tambah 1 baris lewat Supabase SQL Editor | Baris muncul setelah modal dibuka ulang |
| Ganti status di dropdown | Badge ikut berubah; `status` + `updated_at` berubah di DB |
| Set status ke "Selesai" | `tanggal_selesai` otomatis terisi tanggal hari ini |
| Set balik dari "Selesai" | `tanggal_selesai` dikosongkan lagi |
| Klik 🗑️ → OK | Baris hilang dari layar, tapi di DB `is_deleted = true` (baris **tidak** dihapus) |
| Matikan wifi lalu ganti status | Muncul pesan merah "Gagal mengubah status", daftar tidak berubah |
| Lebar layar HP | Kartu menumpuk; harga + aksi turun ke bawah |

Baris contoh untuk uji coba (jalankan di Supabase SQL Editor):

```sql
insert into transaksi_detail (unit_id, jenis_layanan_id, deskripsi, harga, status, tanggal_mulai)
select '7etfa59', id, 'Ganti oli + filter', 85000, 'pending', current_date
from jenis_layanan where nama = 'Servis';
```

Ganti `'7etfa59'` dengan `id` unit yang mau dipakai (lihat tabel `units`).

## 6. Yang sudah diverifikasi vs belum

Sudah:

- `npm run build` lolos.
- Kedua berkas baru lolos kompilasi esbuild, seluruh impornya teresolusi.
- Kolom `transaksi_detail` dicek satu per satu ke database — semuanya cocok dengan spesifikasi.
- Keempat query baca dijalankan sungguhan ke database dan balik `200`: embed
  `jenis_layanan(...)`, filter soft-delete `is_deleted=not.is.true`, dan urutan
  `tanggal_mulai.desc.nullslast,created_at.desc`.

Belum:

- **Fungsi tulis** (`addTransaksi`, `updateTransaksiStatus`, `deleteTransaksi`) belum dijalankan,
  karena itu berarti menulis ke database produksi. Sintaksnya lurus dan skemanya sudah cocok,
  tapi jalur tulisnya belum pernah benar-benar dieksekusi.
- **Tampilan di layar.** Belum pernah dirender di browser mana pun.
- `TransaksiSection` belum disambungkan ke `App.jsx` — langkah 4 masih perlu dikerjakan.

## 7. Kalau bermasalah

| Gejala | Sebab | Solusi |
|---|---|---|
| `Failed to resolve import "@/lib/supabaseClient"` | alias `@/` tidak ada | pakai path relatif, atau tambahkan alias (bagian 3a) |
| Kartu keluar transparan / tanpa warna | dirender di luar `.mr-app` | render dari dalam `UnitDetailModal` |
| Daftar selalu kosong padahal DB ada isinya | `unit_id` tidak cocok; `units.id` itu TEXT (`7etfa59`), bukan UUID | samakan `unit_id` dengan `units.id` |
| Baris yang dihapus tetap muncul | `is_deleted` bernilai NULL, bukan `false` | sudah ditangani: filternya `not.is.true`, mencakup `false` **dan** NULL |
| Peringatan React soal atribut `jsx` | ada `<style jsx>` tersisa | styled-jsx tidak terpasang (bagian 3b) |
| Kesalahan tipe tidak terdeteksi | tidak ada `tsc` yang jalan | pasang TypeScript (bagian 3c) |
| Gagal simpan tapi layar diam saja | — | tidak terjadi: kegagalan memunculkan pesan merah dan daftar tidak diubah |

## 8. Daftar periksa sebelum deploy

- [ ] `npm run build` lolos
- [ ] `TransaksiSection` sudah diimpor dan dirender di `UnitDetailModal` (bagian 4)
- [ ] Diuji di browser dengan minimal satu baris contoh
- [ ] Ganti status tersimpan (cek langsung di tabel Supabase)
- [ ] 🗑️ hanya menyetel `is_deleted = true` — **baris tidak hilang dari tabel**
- [ ] Diuji sekali dalam kondisi offline: muncul pesan galat, bukan diam-diam gagal
- [ ] Dicek di lebar layar HP
- [ ] `export { supabase }` di `src/storage.js` ikut ter-commit
- [ ] Tidak ada `createClient()` kedua di kode
