-- =============================================================================
-- PRA-LAUNCH — Migration 0002 : Row Level Security
--
-- App ini live di URL GitHub Pages yang publik dan anon key selalu ikut
-- ter-bundle di JS. RLS-lah satu-satunya yang memisahkan data dari siapa pun
-- yang membuka URL itu. Single user sekarang, tapi polanya sudah siap
-- multi-user — sama seperti ARUS.
--
-- Tidak ada blok GRANT di sini: Supabase sudah memasang hak akses default
-- untuk schema `public`, dan RLS yang membatasi baris mana yang terlihat.
--
-- Edge Function `send-reminders` memakai service_role key yang MELEWATI RLS.
-- Itu disengaja: cron harus bisa membaca task untuk menyusun ringkasan. Karena
-- itu service role key tidak pernah boleh masuk ke bundle client — hanya
-- sebagai secret Edge Function.
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'app_settings',
    'milestones',
    'tasks',
    'push_subscriptions',
    'notification_log'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy owner_rw on %I for all to authenticated
         using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;
