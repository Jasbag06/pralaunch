-- =============================================================================
-- PRA-LAUNCH — Migration 0006 : alur lanjutan task
--
-- Task sering selesai "kecuali satu hal" — catatan macam "udah kelar kecuali
-- supplier matras, disuruh cari lagi". Bagian yang tersisa itu jadi task baru
-- sendiri, tapi tanpa jejak yang menghubungkannya ke task asal, riwayatnya
-- putus: dari Progres atau Timeline kamu tidak tahu task X ini kelanjutan
-- dari mana.
--
-- `continued_from_key` menyimpan KEY (bukan uuid) task asalnya — pola yang
-- sama dengan `depends_on`, dan untuk alasan yang sama: JSON hasil Ekspor
-- tidak punya uuid, jadi key yang jadi jangkar supaya round-trip Impor/Ekspor
-- tetap utuh.
--
-- Ini BUKAN dependency — task lanjutan tidak menunggu task asalnya (yang
-- justru sudah selesai). Ini murni jejak "task ini lahir dari mana", jadi
-- disimpan terpisah dari depends_on, bukan digabung ke situ.
-- =============================================================================

alter table tasks
  add column if not exists continued_from_key text;

alter table tasks
  add constraint continuation_bukan_diri_sendiri
    check (continued_from_key is null or continued_from_key <> key);

-- ---------------------------------------------------------------------------
-- Perluas trigger yang sudah ada untuk depends_on, supaya continued_from_key
-- ikut terjaga dengan cara yang sama:
--   - task asal dihapus  -> continued_from_key dicabut (bukan dibiarkan
--     menunjuk hantu, dan bukan ikut terhapus — task lanjutannya tetap valid
--     berdiri sendiri)
--   - key task asal berubah -> continued_from_key ikut mengikuti
--
-- CREATE OR REPLACE tidak perlu menyentuh ulang trigger yang sudah terpasang
-- (t_tasks_prune_deps, t_tasks_rename_deps) — keduanya memanggil fungsi ini
-- berdasarkan nama, jadi otomatis memakai definisi terbaru.
-- ---------------------------------------------------------------------------

create or replace function prune_depends_on() returns trigger
language plpgsql as $$
begin
  update tasks
     set depends_on = array_remove(depends_on, old.key)
   where owner_id = old.owner_id
     and old.key = any(depends_on);

  update tasks
     set continued_from_key = null
   where owner_id = old.owner_id
     and continued_from_key = old.key;

  return old;
end $$;

create or replace function rename_depends_on() returns trigger
language plpgsql as $$
begin
  if new.key is distinct from old.key then
    update tasks
       set depends_on = array_replace(depends_on, old.key, new.key)
     where owner_id = old.owner_id
       and old.key = any(depends_on);

    update tasks
       set continued_from_key = new.key
     where owner_id = old.owner_id
       and continued_from_key = old.key;
  end if;
  return null;
end $$;
