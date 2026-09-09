-- =============================================================================
-- PRA-LAUNCH — Task tracker toko pet supplies  |  Supabase / Postgres
-- Migration 0001 : skema inti
--
-- PROJECT
--   Skema ini mengasumsikan Supabase project TERSENDIRI untuk app ini, memakai
--   schema `public` seperti biasa. Jangan dijalankan di project yang sudah
--   dipakai ARUS — di sana nama tabel `app_settings` bentrok langsung.
--
-- TANGGAL
--   Semua kolom tanggal adalah `date` polos tanpa timezone. "Hari ini"
--   ditentukan di Asia/Jakarta oleh client dan Edge Function
--   (src/lib/date.ts), BUKAN oleh server. Jangan pernah pakai current_date
--   di logika bisnis — server Supabase berjalan di UTC dan akan meleset
--   satu hari selama 07:00-24:00 WIB.
--
-- KUNCI TASK
--   `tasks.key` adalah slug stabil buatan manusia (mis. 'w1-nib-daftar').
--   Ia jangkar untuk import JSON yang idempoten DAN isi dari `depends_on`.
--   `depends_on` menyimpan KEY, bukan uuid — lihat catatan di tabel tasks.
-- =============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------ util fns -----
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;


-- =============================================================================
-- 1. APP_SETTINGS — satu baris per user, kolom bertipe (bukan key-value).
--    KV memaksa semua nilai jadi text lalu di-cast bolak-balik tanpa
--    constraint; `reminder_hour = 'abc'` akan lolos diam-diam dan reminder
--    mati tanpa jejak. Pola ini mengikuti app_settings milik ARUS.
-- =============================================================================
create table app_settings (
  owner_id uuid primary key default auth.uid() references auth.users on delete cascade,

  -- sumber data countdown "sisa hari menuju barang tiba" di header Dashboard
  target_arrival_date date,

  reminder_enabled       boolean not null default true,
  reminder_hour          integer not null default 7 check (reminder_hour between 0 and 23),
  deadline_alert_enabled boolean not null default true,
  overdue_alert_enabled  boolean not null default true,

  email_fallback_enabled boolean not null default false,
  email_address          text,

  timezone   text not null default 'Asia/Jakarta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- toggle email nyala tapi alamatnya kosong = reminder diam-diam tidak
  -- terkirim. Ditolak di level database, bukan cuma di form.
  constraint email_wajib_saat_fallback_nyala check (
    not email_fallback_enabled
    or (email_address is not null and length(btrim(email_address)) > 0)
  )
);
create trigger t_app_settings_upd before update on app_settings
  for each row execute function set_updated_at();


-- =============================================================================
-- 2. MILESTONES — baris 🔴 DEADLINE dari jadwal.
-- =============================================================================
create table milestones (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,

  key         text not null,
  title       text not null,
  target_date date not null,
  week_number integer not null check (week_number between 1 and 5),

  status      text not null default 'pending'
              check (status in ('pending', 'achieved', 'missed')),
  achieved_at timestamptz,
  sort_order  integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_id, key),
  constraint milestone_key_slug check (key ~ '^[a-z0-9][a-z0-9._-]*$')
);
create index on milestones (owner_id, target_date);
create trigger t_milestones_upd before update on milestones
  for each row execute function set_updated_at();


-- =============================================================================
-- 3. TASKS
-- =============================================================================
create table tasks (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,

  -- Slug stabil. Ini yang membuat import JSON dari chat bisa idempoten:
  -- JSON hasil chat tidak punya uuid, dan mode replace_week membuat ulang
  -- baris dengan uuid baru sehingga dependensi berbasis uuid pasti putus.
  key         text not null,
  title       text not null,
  description text,

  scheduled_date date not null,
  week_number    integer not null check (week_number between 1 and 5),

  -- text + check, bukan enum: daftar workstream kemungkinan bertambah, dan
  -- menambah nilai enum butuh migrasi tersendiri tiap kali.
  workstream text not null check (workstream in (
    'Legal', 'Branding', 'Riset', 'Listing', 'Operasional',
    'Konten', 'Ads', 'Supplier', 'Keuangan'
  )),
  priority text not null default 'normal'
           check (priority in ('critical', 'normal', 'buffer')),

  is_deadline  boolean not null default false,
  milestone_id uuid references milestones(id) on delete set null,

  status text not null default 'todo'
         check (status in ('todo', 'in_progress', 'done', 'skipped')),
  completed_at timestamptz,

  -- Berisi tasks.key, BUKAN uuid. Postgres tidak bisa memasang foreign key
  -- ke elemen array, jadi integritas referensialnya nol di kedua pilihan —
  -- key menang karena import/export JSON jadi round-trip langsung tanpa
  -- tahap resolve. Key gantung dijaga trigger t_tasks_prune_deps di bawah.
  depends_on text[] not null default '{}',

  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  notes             text,
  sort_order        integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_id, key),
  constraint task_key_slug check (key ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint task_tidak_bergantung_pada_diri_sendiri check (not (key = any(depends_on)))
);

create index on tasks (owner_id, scheduled_date);
create index on tasks (owner_id, status);
create index on tasks (owner_id, week_number);
create index on tasks using gin (depends_on);

create trigger t_tasks_upd before update on tasks
  for each row execute function set_updated_at();


-- completed_at mengikuti status, tidak pernah diisi client. Kalau diserahkan
-- ke client, cepat atau lambat ada jalur yang lupa mengisinya dan riwayat
-- "selesai minggu ini" jadi bohong.
create or replace function sync_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger t_tasks_completed before insert or update on tasks
  for each row execute function sync_completed_at();


-- Task dihapus -> cabut key-nya dari depends_on task lain. Tanpa ini ada
-- task yang "Terkunci" selamanya, menunggu sesuatu yang sudah tidak ada,
-- dan Dashboard tidak punya nama pemblokir untuk ditampilkan.
create or replace function prune_depends_on() returns trigger
language plpgsql as $$
begin
  update tasks
     set depends_on = array_remove(depends_on, old.key)
   where owner_id = old.owner_id
     and old.key = any(depends_on);
  return old;
end $$;

create trigger t_tasks_prune_deps after delete on tasks
  for each row execute function prune_depends_on();


-- Key diganti -> dependensi ikut pindah, bukan jadi gantung.
create or replace function rename_depends_on() returns trigger
language plpgsql as $$
begin
  if new.key is distinct from old.key then
    update tasks
       set depends_on = array_replace(depends_on, old.key, new.key)
     where owner_id = old.owner_id
       and old.key = any(depends_on);
  end if;
  return null;
end $$;

create trigger t_tasks_rename_deps after update of key on tasks
  for each row execute function rename_depends_on();


-- =============================================================================
-- 4. PUSH_SUBSCRIPTIONS — satu baris per device.
--    iOS memberi endpoint BARU tiap PWA di-install ulang, jadi endpoint unik
--    supaya re-subscribe jadi upsert dan bukan duplikat yang menumpuk.
-- =============================================================================
create table push_subscriptions (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,

  endpoint text not null,
  p256dh   text not null,
  auth     text not null,

  user_agent   text,
  last_seen_at timestamptz not null default now(),

  -- Endpoint yang membalas 404/410 Gone harus dimatikan. Kalau tidak, tiap
  -- pengiriman makin lama karena menunggu endpoint mati satu per satu.
  failed_count integer not null default 0,
  disabled_at  timestamptz,

  created_at timestamptz not null default now(),
  unique (endpoint)
);
create index on push_subscriptions (owner_id) where disabled_at is null;


-- =============================================================================
-- 5. NOTIFICATION_LOG — dedup pengiriman.
--    pg_cron memanggil Edge Function tiap 15 menit dan function-lah yang
--    memutuskan apakah sudah waktunya. Tanpa log ini, ringkasan harian
--    terkirim 96x sehari.
-- =============================================================================
create table notification_log (
  id       bigserial primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,

  kind     text not null check (kind in ('daily_digest', 'deadline', 'overdue')),
  for_date date not null,           -- tanggal Asia/Jakarta yang diwakili
  channel  text not null default 'push' check (channel in ('push', 'email')),

  sent_count   integer not null default 0,
  failed_count integer not null default 0,
  detail       jsonb   not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  -- channel ikut kunci: push dan email dicatat terpisah, supaya menyalakan
  -- email fallback di tengah hari tidak tertahan oleh log push hari itu.
  unique (owner_id, kind, for_date, channel)
);
create index on notification_log (owner_id, for_date desc);
