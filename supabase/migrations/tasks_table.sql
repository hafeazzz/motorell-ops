-- Motorell Ops: tabel task terpisah (sama semangatnya dgn tabel `chat` & `attendance`).
-- Jalankan ini SEKALI di Supabase Dashboard -> SQL Editor.
--
-- Alasan: sebelumnya task ikut di satu blob JSON besar (tabel kv) yang ditulis ULANG SELURUHNYA
-- tiap ada perubahan apa pun. Itu rawan tabrakan: kalau owner assign task sementara HP lain
-- menyimpan perubahan lain hampir bersamaan, yang belakangan menang & assign-nya hilang tanpa
-- error -> badge/notifikasi task jadi tidak akurat & terasa "lag / tiba-tiba hilang".
-- Tabel ini bikin tiap operasi task = 1 baris: assign = INSERT, centang/edit = UPDATE baris itu,
-- hapus = DELETE baris itu. Blast radius kecil, tidak bisa menimpa data lain.

create table if not exists public.tasks (
  id text primary key,
  user_id text not null,        -- task ini untuk siapa
  title text not null default '',
  done boolean not null default false,
  set_by text,                  -- "owner" (ditugaskan) atau "self" (task sendiri)
  date text,                    -- YYYY-MM-DD, WIB
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists tasks_user_idx on public.tasks (user_id);

-- App ini tidak punya auth per-user (lihat CLAUDE.md) -- akses shared data pakai kunci anon,
-- sama pola tabel kv/chat/attendance/push_subs. Policy dibuat terbuka juga, konsisten.
alter table public.tasks enable row level security;

create policy "tasks_select_all" on public.tasks for select using (true);
create policy "tasks_insert_all" on public.tasks for insert with check (true);
create policy "tasks_update_all" on public.tasks for update using (true);
create policy "tasks_delete_all" on public.tasks for delete using (true);

-- Realtime: badge & notifikasi task langsung sinkron di semua HP tanpa refresh (sama spt chat).
alter publication supabase_realtime add table public.tasks;
