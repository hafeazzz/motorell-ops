-- Motorell Ops: tabel unit motor terpisah (sama pola dgn chat/attendance/tasks).
-- Jalankan ini SEKALI di Supabase Dashboard -> SQL Editor.
--
-- Alasan: unit masih ikut di satu blob JSON besar (tabel kv) yang ditulis ULANG SELURUHNYA tiap
-- ada perubahan apa pun -> rawan tabrakan tulis (last-write-wins) yang bisa menghilangkan unit
-- kalau 2 HP menyimpan hampir bersamaan. Ini menutup satu-satunya celah kehilangan data unit.
--
-- Seluruh objek unit disimpan apa adanya di kolom `data` (JSONB) -- termasuk field bersarang
-- seperti inspectionResult + foto -- supaya TIDAK ADA field yang bisa hilang/tertinggal.
-- Blob kv-nya sendiri TIDAK dihapus (tetap jadi cadangan).

create table if not exists public.units (
  id text primary key,
  data jsonb not null,          -- seluruh objek unit (name, plate, harga, status, soldAt,
                                -- investorCode/Share, odometer, photo, inspectionResult, dll)
  status text,                  -- disalin dari data.status utk indeks/filter (opsional)
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint
);

create index if not exists units_status_idx on public.units (status);

-- App ini tanpa auth per-user (lihat CLAUDE.md) -- akses shared data pakai kunci anon, sama pola
-- tabel kv/chat/attendance/tasks/push_subs. Policy dibuat terbuka juga, konsisten.
alter table public.units enable row level security;

create policy "units_select_all" on public.units for select using (true);
create policy "units_insert_all" on public.units for insert with check (true);
create policy "units_update_all" on public.units for update using (true);
create policy "units_delete_all" on public.units for delete using (true);

-- Realtime: perubahan unit (tambah/edit/status/hapus) langsung sinkron di semua HP tanpa refresh.
alter publication supabase_realtime add table public.units;
