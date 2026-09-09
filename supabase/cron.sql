-- =============================================================================
-- PRA-LAUNCH — penjadwalan pengingat
--
-- BUKAN migrasi. File ini berisi nilai khusus project kamu, jadi EDIT DULU
-- dua tempat bertanda GANTI di bawah, baru jalankan di SQL Editor.
--
-- Kenapa tiap 15 menit, bukan tepat jam 07:00:
--   pg_cron menyimpan jadwal statis dalam UTC. 07:00 WIB memang = 00:00 UTC,
--   jadi jadwal tetap akan benar HARI INI — tapi begitu kamu ubah jam reminder
--   lewat Settings, entri cron-nya tidak ikut berubah dan pengingat diam-diam
--   datang di jam yang salah. Dengan cron sering + keputusan di dalam Edge
--   Function, toggle di Settings benar-benar bekerja tanpa menyentuh database.
--   Biayanya 96 pemanggilan/hari, jauh di bawah kuota gratis Supabase.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secret disimpan di Vault, bukan ditulis langsung di perintah cron:
-- tabel cron.job bisa dibaca, jadi secret yang ditempel di sana bocor.
select vault.create_secret(
  'GANTI_DENGAN_CRON_SECRET_YANG_SAMA_DI_EDGE_FUNCTION',
  'cron_secret',
  'Header x-cron-secret untuk send-reminders'
);

-- Hapus jadwal lama kalau file ini dijalankan ulang.
select cron.unschedule('pralaunch-reminders')
where exists (select 1 from cron.job where jobname = 'pralaunch-reminders');

select cron.schedule(
  'pralaunch-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    -- GANTI <PROJECT_REF> dengan ref project kamu (ada di URL Supabase).
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  (select decrypted_secret from vault.decrypted_secrets
                          where name = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);


-- ---------------------------------------------------------------- periksa ---
-- Jadwal terdaftar:
--   select jobid, jobname, schedule, active from cron.job;
--
-- Riwayat 10 eksekusi terakhir (status, pesan error kalau gagal):
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'pralaunch-reminders')
--    order by start_time desc limit 10;
--
-- Apa yang sudah terkirim:
--   select kind, channel, for_date, sent_count, failed_count, created_at
--     from notification_log order by created_at desc limit 20;
--
-- Mematikan sementara:
--   select cron.unschedule('pralaunch-reminders');
-- =============================================================================
