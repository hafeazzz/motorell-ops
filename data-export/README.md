# data-export/

Tempat menaruh hasil ekspor JSON dari Supabase sebelum diimpor ke Firebase.

Berkas `.json` di folder ini **tidak ikut ter-commit** (lihat `.gitignore`) — isinya data
operasional asli, termasuk foto base64 dan data pribadi di STNK.

## Berkas yang diharapkan

| Berkas | Sumber di Supabase | Jumlah saat ini |
|---|---|---|
| `units.json` | tabel `units` → **bongkar `row.data`** | 22 |
| `users.json` | blob `kv` → `motorell-state-v3` → `.users` | 6 |
| `tasks.json` | tabel `tasks` | 15 |
| `expenses.json` | blob `kv` → `.expenses` | 16 |

## Yang BELUM ditangani skrip migrasi

Ini bukan daftar tunggu — ini data yang akan **tertinggal diam-diam** kalau Supabase dimatikan:

| Data | Jumlah | Letak |
|---|---|---|
| attendance | 134 | tabel `attendance` |
| media | 13 | blob `kv` |
| chat | 8 | blob `kv` (tabel `chat` sendiri sudah 0, kena auto-prune) |
| lives | 3 | blob `kv` |
| inspections | 1 | blob `kv` |
| extras | 1 | blob `kv` — dasar hitungan bonus |
| verifikasi | 1 | tabel `verifikasi` |
| handbook PDF | 1 berkas | bucket Storage `handbook` |
| foto STNK | — | bucket Storage `stnk` |
| langganan push | — | tabel + Edge Function `send-push` |

Totalnya **161 catatan** — lebih banyak daripada 59 yang dipindah.

## Catatan bentuk data

Tabel `units` di Supabase menyimpan seluruh objek unit di **satu kolom `data` (JSONB)**:

```json
{ "id": "7etfa59", "data": { "id": "7etfa59", "name": "Kawasaki W175 TR 2022", ... } }
```

Saat mengekspor, ambil isi `row.data`, bukan barisnya. Kalau tidak, tiap dokumen Firestore jadi
`{ data: { ... } }` bersarang dan seluruh `App.jsx` tidak akan menemukan fieldnya.

`id` lama **wajib dipertahankan** (skrip impor sudah melakukannya): `expenses.unitId`,
`inspections.unitId`, dan path berkas STNK semuanya menunjuk ke id itu. Id acak akan memutus
kaitannya.
