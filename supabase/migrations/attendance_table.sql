-- Motorell Ops: tabel absensi terpisah (append-only style, sama semangatnya dgn tabel `chat`).
-- Jalankan ini SEKALI di Supabase Dashboard -> SQL Editor.
--
-- Alasan: sebelumnya absen ikut nimbrung di satu blob JSON besar (tabel kv) yang ditulis ulang
-- SELURUHNYA tiap ada perubahan apa pun (absen, unit, expense, task, dll). Itu rawan race:
-- kalau 2 hal disimpan hampir bersamaan, yang belakangan menang dan yang duluan hilang tanpa
-- pesan error. Tabel ini membuat absen masuk = 1 INSERT baris baru, absen keluar = 1 UPDATE
-- baris itu saja -- blast radius-nya jauh lebih kecil, cuma bisa "tabrakan" kalau ORANG YANG
-- SAMA absen di baris YANG SAMA di detik yang sama (praktis tidak pernah terjadi).

create table if not exists public.attendance (
  id text primary key,
  user_id text not null,
  date text not null,        -- format YYYY-MM-DD, WIB
  clock_in text,
  photo text,
  clock_out text,
  photo_out text,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists attendance_date_idx on public.attendance (date);
create index if not exists attendance_user_idx on public.attendance (user_id);

-- App ini tidak punya sistem auth (lihat CLAUDE.md) -- semua akses shared data pakai kunci
-- publishable/anon, sama persis pola tabel kv/chat/push_subs yang sudah ada. Jadi policy-nya
-- dibuat terbuka juga, konsisten dgn tabel lain, BUKAN kelonggaran baru.
alter table public.attendance enable row level security;

create policy "attendance_select_all" on public.attendance for select using (true);
create policy "attendance_insert_all" on public.attendance for insert with check (true);
create policy "attendance_update_all" on public.attendance for update using (true);

-- Realtime: biar HP lain langsung lihat absen masuk/keluar tanpa refresh manual (sama spt chat).
alter publication supabase_realtime add table public.attendance;
