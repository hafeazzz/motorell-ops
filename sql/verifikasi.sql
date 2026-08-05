-- Tabel permohonan verifikasi. Jalankan SEKALI di Supabase → SQL Editor.
-- Aman diulang (semua pakai IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- CATATAN TIPE: `requested_by` dan `verified_by` sengaja TEXT, bukan UUID. Motorell Ops tidak
-- memakai Supabase Auth — id user-nya string pendek buatan sendiri ('u_own', 'u_omen',
-- 'kyldr20') yang disimpan di state.users. Kolom UUID akan menolak semuanya.

create table if not exists public.verifikasi (
  id                 uuid primary key default gen_random_uuid(),
  type               text        not null check (type in ('purchase','decision','permission','other')),
  title              text        not null,
  description        text        not null default '',
  requested_by       text        not null,
  requested_at       timestamptz not null default now(),
  status             text        not null default 'pending'
                       check (status in ('pending','approved','rejected','cancelled')),
  verified_by        text,
  verified_at        timestamptz,
  verification_notes text,
  metadata           jsonb       not null default '{}'::jsonb
);

-- Daftar selalu diurutkan terbaru dulu dan sering disaring per status.
create index if not exists verifikasi_status_idx       on public.verifikasi (status, requested_at desc);
create index if not exists verifikasi_requested_by_idx on public.verifikasi (requested_by);

-- Pola RLS sama dengan tabel lain di project ini: RLS aktif, policy izinkan semua.
-- Kontrol siapa boleh menyetujui ditegakkan di aplikasi (lihat verifCanApprove di App.jsx),
-- bukan di database. Kalau nanti pakai Supabase Auth betulan, perketat di sini.
alter table public.verifikasi enable row level security;
drop policy if exists "verifikasi allow all" on public.verifikasi;
create policy "verifikasi allow all" on public.verifikasi for all using (true) with check (true);

-- Realtime supaya permohonan baru / keputusan langsung muncul di HP lain tanpa refresh.
do $$
begin
  alter publication supabase_realtime add table public.verifikasi;
exception
  when duplicate_object then null;  -- sudah terdaftar
end $$;
