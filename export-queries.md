# Query ekspor Supabase → Firebase

Dicek langsung ke database produksi, 21 Agustus 2026. Jalankan di **Supabase → SQL Editor**,
salin hasilnya ke `data-export/`.

## Kenapa query di draf awal tidak dipakai

Draf itu memecah `data` JSONB jadi kolom satu per satu (`u.data->>'brand' as brand`, dst).
Hasilnya kosong sebagian besar:

| Diminta draf | Kenyataan |
|---|---|
| `fullName` | tidak ada — namanya `name` |
| `stnkPhotoUrl` | tidak ada — namanya `stnkPath` (path bucket, bukan URL) |
| `photoUrl` | tidak ada — namanya `photo` (base64, bukan URL) |
| `nominal_dp` | tidak ada — namanya `dp` |
| `notes` | tidak ada di unit |
| `maintainCost` | tidak ada di unit |
| `created_at` / `updated_at` | kolom TABEL, tidak ada di dalam `data` |

Delapan kolom NULL untuk semua baris. Lebih parah, **13 field asli ikut hilang** karena tidak
disebut: `name`, `model`, `plate`, `odometer`, `investorCode`, `investorShare`, `soldBy`,
`soldAtPrev`, `stnkPath`, `dp`, `siapAt`, `photo`, `inspectionResult`.

Field unit yang sebenarnya ada (22 unit):

```
brand, buyPrice, color, dp, id, inDate, inspectionResult, investorCode, investorShare,
investors, model, name, odometer, photo, plate, sellPrice, siapAt, soldAt, soldAtPrev,
soldBy, status, stnkPath, year
```

Catatan: `brand`/`color`/`year` cuma terisi di 3 dari 22 unit — sisanya dibuat sebelum nama motor
dipecah jadi 4 bagian, jadi identitasnya ada di `name`. Itu normal, bukan data rusak.

**Intinya: `data` JSONB SUDAH berbentuk yang benar. Jangan dibongkar — ambil utuh.**

---

## Query 1 — units (22 baris)

```sql
select jsonb_pretty(jsonb_agg(u.data order by u.created_at))
from public.units u;
```

Hasilnya satu array JSON siap pakai → simpan sebagai `data-export/units.json`.

Tidak perlu `jq` dan tidak perlu unwrap manual: `u.data` memang sudah objek unit yang dibaca
`App.jsx`. Yang salah adalah membongkarnya, bukan membiarkannya.

---

## Query 2 — users (6 baris)

Tidak ada tabel `public.users` maupun `auth.users` yang dipakai. Motorell Ops **tidak memakai
Supabase Auth** — user disimpan di dalam blob `kv`:

```sql
select jsonb_pretty((kv.value)::jsonb -> 'users')
from public.kv
where kv.key = 'motorell-state-v3';
```

→ `data-export/users.json`

`id`-nya string buatan sendiri (`u_own`, `kyldr20`) dan **wajib dipertahankan** — `me.id`,
`expenses.by`, `tasks.userId`, dan `soldBy` semuanya menunjuk ke situ.

---

## Query 3 — tasks (15 baris)

Tabel `tasks` punya kolom asli, **bukan** `data` JSONB (`t.data->>'title'` akan error).
Kolomnya: `id, user_id, title, done, set_by, date, created_at`.

Query di bawah sekalian mengubahnya ke bentuk yang dipakai app (lihat `taskRowToRec` di
`src/storage.js`) — `user_id` → `userId`, `set_by` → `setBy`:

```sql
select jsonb_pretty(jsonb_agg(
  jsonb_build_object(
    'id',     t.id,
    'userId', t.user_id,
    'title',  coalesce(t.title, ''),
    'done',   coalesce(t.done, false),
    'setBy',  coalesce(t.set_by, 'self'),
    'date',   coalesce(t.date::text, '')
  ) order by t.created_at
))
from public.tasks t;
```

→ `data-export/tasks.json`

---

## Query 4 — expenses (16 baris)

**Tidak ada tabel `public.expenses`.** Pengeluaran ada di dalam blob `kv`:

```sql
select jsonb_pretty((kv.value)::jsonb -> 'expenses')
from public.kv
where kv.key = 'motorell-state-v3';
```

→ `data-export/expenses.json`

Bentuknya: `{ id, unitId, cat, amount, note, by, date }`. `unitId` menunjuk ke `units.id`, jadi
id unit tidak boleh berubah saat impor.

---

## Cek cepat sesudah ekspor

```sql
-- harus: 22, 6, 15, 16
select
  (select count(*) from public.units)                                              as units,
  (select jsonb_array_length((value)::jsonb -> 'users')    from public.kv where key='motorell-state-v3') as users,
  (select count(*) from public.tasks)                                              as tasks,
  (select jsonb_array_length((value)::jsonb -> 'expenses') from public.kv where key='motorell-state-v3') as expenses;
```

Lalu jalankan `validateAllData()` (lihat `src/data-structure-validator.js`) di console browser
sebelum impor.

---

## Yang BELUM ditangani (161 catatan)

Ini bukan daftar tunggu — ini yang akan **hilang diam-diam** kalau Supabase dimatikan sekarang.
Query-nya disediakan supaya bisa diekspor juga kalau diputuskan ikut pindah.

```sql
-- attendance (134) — tabel sendiri, paling besar
select jsonb_pretty(jsonb_agg(to_jsonb(a) order by a.date)) from public.attendance a;

-- media (13), lives (3), inspections (1), extras (1), chat (8) — semuanya di blob kv
select jsonb_pretty(jsonb_build_object(
  'media',       (value)::jsonb -> 'media',
  'lives',       (value)::jsonb -> 'lives',
  'inspections', (value)::jsonb -> 'inspections',
  'extras',      (value)::jsonb -> 'extras',
  'chat',        (value)::jsonb -> 'chat'
)) from public.kv where key = 'motorell-state-v3';

-- verifikasi (1) — tabel sendiri
select jsonb_pretty(jsonb_agg(to_jsonb(v))) from public.verifikasi v;
```

`extras` kelihatannya cuma 1 baris, tapi itu **dasar hitungan bonus** (`saleBonusFor` /
`totalExtraFor`). Menghilangkannya mengubah angka extra cash tim.

Belum termasuk: bucket `handbook` (PDF), bucket `stnk` (foto STNK), langganan web push, dan
Edge Function `send-push` — yang terakhir bukan salin data, tapi tulis ulang ke FCM.
