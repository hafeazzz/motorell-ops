-- PERBAIKAN: kolom requested_by / verified_by terlanjur dibuat bertipe UUID.
--
-- Gejalanya: "invalid input syntax for type uuid: 'kyldr20'".
-- Sebabnya BUKAN di kode. Motorell Ops tidak memakai Supabase Auth — id usernya string pendek
-- buatan sendiri yang disimpan di state.users ('u_own', 'u_omen', 'kyldr20'), jadi kolom UUID
-- menolak semuanya. sql/verifikasi.sql memang sudah memakai TEXT; yang terlanjur jalan sepertinya
-- skema versi lama yang menulis `requested_by (uuid)`.
--
-- Jalankan SALAH SATU di Supabase → SQL Editor.

-- =====================================================================
-- PILIHAN A (disarankan selama tabel masih kosong): buat ulang bersih.
-- Ini juga memastikan CHECK constraint, DEFAULT, index, policy RLS, dan
-- pendaftaran realtime ikut benar — bukan cuma tipe kolomnya.
-- Cek dulu isinya: select count(*) from public.verifikasi;  -- harus 0
-- =====================================================================
drop table if exists public.verifikasi;
-- lalu jalankan ulang seluruh isi sql/verifikasi.sql


-- =====================================================================
-- PILIHAN B: kalau tabelnya SUDAH ADA ISINYA dan tidak boleh hilang.
-- Ubah tipenya saja. Baris lama yang sudah berisi UUID tetap terbaca
-- (UUID valid tetap valid sebagai teks), jadi tidak ada data yang hilang.
-- =====================================================================
-- alter table public.verifikasi alter column requested_by type text using requested_by::text;
-- alter table public.verifikasi alter column verified_by  type text using verified_by::text;
--
-- Pilihan B TIDAK menambahkan hal-hal berikut kalau tabelnya dibuat dari skema lama.
-- Jalankan juga bagian yang belum ada:
--
-- alter table public.verifikasi
--   add constraint verifikasi_type_check   check (type   in ('purchase','decision','permission','other')),
--   add constraint verifikasi_status_check check (status in ('pending','approved','rejected','cancelled'));
-- alter table public.verifikasi alter column status       set default 'pending';
-- alter table public.verifikasi alter column requested_at set default now();
-- alter table public.verifikasi alter column metadata     set default '{}'::jsonb;
-- create index if not exists verifikasi_status_idx       on public.verifikasi (status, requested_at desc);
-- create index if not exists verifikasi_requested_by_idx on public.verifikasi (requested_by);
-- alter table public.verifikasi enable row level security;
-- drop policy if exists "verifikasi allow all" on public.verifikasi;
-- create policy "verifikasi allow all" on public.verifikasi for all using (true) with check (true);
-- do $$ begin
--   alter publication supabase_realtime add table public.verifikasi;
-- exception when duplicate_object then null; end $$;


-- =====================================================================
-- Verifikasi sesudahnya — harus balik 0 baris, BUKAN error 22P02.
-- =====================================================================
-- select id from public.verifikasi where requested_by = 'kyldr20';
