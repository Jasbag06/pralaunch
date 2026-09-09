-- =============================================================================
-- PRA-LAUNCH — Migration 0004 : jenis lampiran ketiga, 'path'
--
-- 'path' adalah CATATAN LOKASI, bukan file. Isinya teks seperti
-- 'D:\proyek\riset\harga-v3.xlsx' — app menampilkan nama file dan foldernya,
-- dan mengklik chip-nya menyalin path itu ke clipboard.
--
-- Sengaja tidak bisa dibuka langsung: browser memblokir link file:// dari
-- halaman http, dan path Windows tidak berarti apa-apa di iPad. Gunanya
-- semata supaya kamu tidak perlu mengingat-ingat hasil kerja kemarin ditaruh
-- di mana.
--
-- Kolomnya terpisah dari `url` karena `url` punya constraint link_harus_http;
-- 'D:\...' akan langsung ditolak kalau ditumpangkan ke sana.
-- =============================================================================

alter table attachments
  drop constraint if exists attachments_kind_check;

alter table attachments
  add constraint attachments_kind_check check (kind in ('file', 'link', 'path'));

alter table attachments
  add column if not exists local_path text;

alter table attachments
  add constraint path_wajib_punya_local_path check (
    kind <> 'path'
    or (local_path is not null and length(btrim(local_path)) > 0)
  );
