-- =============================================================================
-- PRA-LAUNCH — Migration 0003 : lampiran per task
--
-- Satu tabel untuk dua jenis lampiran yang sengaja dibedakan:
--
--   'file' — di-upload ke Supabase Storage. Salinan yang ikut ke task dan bisa
--            dibuka dari HP, iPad, maupun laptop. Cocok untuk yang sekali jadi:
--            scan KTP, NPWP, foto produk.
--
--   'link' — URL ke Google Drive / OneDrive / Sheet. Kalau file-nya ada di
--            folder yang tersinkron, link selalu menunjuk versi terbaru. Ini
--            satu-satunya jalur yang memberi perilaku "saya save di folder,
--            app ikut ter-update" — yang menyinkronkan Drive-nya, bukan
--            browser. Cocok untuk dokumen yang sering direvisi.
--
-- Browser TIDAK bisa memantau folder lokal lalu menyimpan balik ke sana.
-- File System Access API cuma ada di Chrome/Edge desktop dan tidak ada sama
-- sekali di iOS, jadi tidak dipakai.
-- =============================================================================

create table attachments (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id  uuid not null references tasks(id) on delete cascade,

  kind  text not null check (kind in ('file', 'link')),
  label text not null,

  -- kind = 'file'
  storage_path text,          -- '<owner_id>/<task_id>/<uuid>-<namafile>'
  mime_type    text,
  size_bytes   bigint,

  -- kind = 'link'
  url text,

  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint file_wajib_punya_path check (kind <> 'file' or storage_path is not null),
  constraint link_wajib_punya_url  check (kind <> 'link' or url is not null),
  -- Cegah link javascript:/data: yang bisa dieksekusi saat diklik.
  constraint link_harus_http check (url is null or url ~* '^https?://')
);

create index on attachments (owner_id, task_id);

alter table attachments enable row level security;
create policy owner_rw on attachments for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());


-- =============================================================================
-- STORAGE — bucket privat 'lampiran'
--
-- Dibuat lewat migrasi supaya tidak ada langkah manual tambahan di dashboard.
-- Privat: file hanya bisa dibuka lewat signed URL berumur pendek yang
-- diterbitkan app setelah user login. Kalau bucket ini public, siapa pun yang
-- menebak path bisa mengunduh scan KTP kamu.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('lampiran', 'lampiran', false, 10485760)  -- 10 MB per file
on conflict (id) do nothing;


-- Path selalu diawali owner_id, jadi segmen folder pertama itulah kuncinya.
-- storage.foldername('abc/def/x.pdf') -> {abc, def}
do $$
declare
  aksi text;
begin
  foreach aksi in array array['select', 'insert', 'update', 'delete']
  loop
    execute format($f$
      create policy lampiran_own_%1$s on storage.objects for %1$s to authenticated
        %2$s (bucket_id = 'lampiran' and (storage.foldername(name))[1] = auth.uid()::text)
    $f$, aksi, case when aksi = 'insert' then 'with check' else 'using' end);
  end loop;
end $$;
