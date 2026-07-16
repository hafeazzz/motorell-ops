-- ============================================================================
-- Penjadwalan alarm via Supabase pg_cron (pengganti Vercel Cron).
--
-- Kenapa pindah dari Vercel Cron:
--   - Vercel plan Hobby cuma boleh 2 cron job (kita butuh 4) DAN waktunya tidak
--     presisi (bisa molor sampai ~59 menit) -- itu sebabnya alarm istirahat 12:00
--     WIB baru nyampe ~12:30.
--   - pg_cron presisi per menit dan tidak ada batas jumlah job.
--
-- Cara kerja: pg_cron memanggil endpoint /api/send-break-alarm yang SUDAH ada
-- (lihat api/send-break-alarm.js) lewat pg_net. Semua logika pemilihan sasaran
-- (filter staff, skip yang sudah absen) tetap dipakai ulang di endpoint itu --
-- tidak ditulis ulang di SQL.
--
-- Jadwal (UTC; WIB = UTC+7) -- sama persis dgn vercel.json:
--   absen_masuk  08:45 WIB = 01:45 UTC  -> 45 1 * * *
--   break_start  12:00 WIB = 05:00 UTC  -> 0 5 * * *
--   break_end    13:30 WIB = 06:30 UTC  -> 30 6 * * *
--   absen_pulang 18:00 WIB = 11:00 UTC  -> 0 11 * * *
--
-- SEBELUM alarm bisa jalan, set dulu 2 secret di Vault (sekali saja) -- lihat
-- blok "SETUP VAULT" di bawah. Setelah itu HAPUS blok "crons" di vercel.json biar
-- tidak dobel-picu.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- Fungsi pemicu: baca base URL + (opsional) CRON_SECRET dari Vault, lalu POST ke
-- endpoint Vercel. Async/fire-and-forget (pg_net menaruh request ke antrean,
-- responsnya nanti tersimpan di net._http_response).
-- ----------------------------------------------------------------------------
create or replace function public.fire_alarm(alarm_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  secret   text;
  hdrs     jsonb := jsonb_build_object('Content-Type', 'application/json');
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'alarm_base_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'alarm_cron_secret';

  if base_url is null or base_url = '' then
    raise exception 'Vault secret "alarm_base_url" belum diset -- lihat blok SETUP VAULT.';
  end if;

  -- Kalau CRON_SECRET di-set di env Vercel, endpoint minta header ini. Kalau tidak
  -- diset (secret null/kosong), header tidak dikirim -- endpoint tetap terbuka & jalan.
  if secret is not null and secret <> '' then
    hdrs := hdrs || jsonb_build_object('Authorization', 'Bearer ' || secret);
  end if;

  perform net.http_post(
    url                  := base_url || '/api/send-break-alarm?type=' || alarm_type,
    headers              := hdrs,
    body                 := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- (Re)schedule keempat job. Unschedule dulu (aman kalau belum ada) supaya
-- migration ini idempotent -- boleh dijalankan ulang tanpa bikin job dobel.
-- ----------------------------------------------------------------------------
do $$
declare j text;
begin
  foreach j in array array['alarm_absen_masuk','alarm_break_start','alarm_break_end','alarm_absen_pulang'] loop
    begin perform cron.unschedule(j); exception when others then null; end;
  end loop;
end $$;

select cron.schedule('alarm_absen_masuk',  '45 1 * * *', $$select public.fire_alarm('absen_masuk')$$);
select cron.schedule('alarm_break_start',  '0 5 * * *',  $$select public.fire_alarm('break_start')$$);
select cron.schedule('alarm_break_end',    '30 6 * * *', $$select public.fire_alarm('break_end')$$);
select cron.schedule('alarm_absen_pulang', '0 11 * * *', $$select public.fire_alarm('absen_pulang')$$);

-- ============================================================================
-- SETUP VAULT (jalankan SEKALI di SQL Editor Supabase, ganti nilainya):
--
--   -- Domain produksi Vercel-mu, TANPA garis miring di akhir:
--   select vault.create_secret('https://GANTI-DOMAIN.vercel.app', 'alarm_base_url');
--
--   -- CRON_SECRET: isi kalau kamu set env CRON_SECRET di Vercel. Kalau tidak,
--   -- lewati baris ini (endpoint tetap jalan, cuma terbuka utk publik):
--   select vault.create_secret('ISI-CRON-SECRET-KAMU', 'alarm_cron_secret');
--
-- Kalau perlu ganti nilai yang sudah ada, pakai vault.update_secret(id, ...)
-- atau hapus lalu buat ulang.
-- ============================================================================

-- Tes manual tanpa nunggu jadwal (dry-run tidak membangunkan satu tim):
--   select public.fire_alarm('break_start');
--   -- lalu cek hasil kirimnya:
--   select * from net._http_response order by created desc limit 5;
--
-- Lihat daftar job & histori jalannya:
--   select jobname, schedule, active from cron.job order by jobname;
--   select * from cron.job_run_details order by start_time desc limit 10;
