-- =============================================================================
-- PRA-LAUNCH — Migration 0005 : sembunyikan hasil dari Dasbor
--
-- Blok "Hasil tersimpan" di Dasbor lama-lama penuh oleh hasil kerja yang sudah
-- tidak relevan. Kolom ini menandai mana yang tidak perlu lagi nongol di sana.
--
-- Ini HANYA menyembunyikan dari Dasbor. Task-nya tetap utuh: tetap terhitung
-- di persentase progres, tetap ada di riwayat halaman Progres, tetap di
-- Timeline, dan lampiran serta catatannya tidak disentuh sama sekali. Jadi
-- ini bukan penghapusan — cuma "jangan tampilkan di layar harian".
--
-- Pakai timestamptz, bukan boolean, supaya kalau suatu saat ingin tahu kapan
-- sesuatu disingkirkan, datanya sudah ada.
-- =============================================================================

alter table tasks
  add column if not exists result_hidden_at timestamptz;

-- Dasbor hanya melihat yang belum disembunyikan, jadi indeks parsial ini yang
-- relevan; barisnya sedikit dan tidak membebani penulisan.
create index if not exists tasks_hasil_tampil
  on tasks (owner_id, completed_at desc)
  where status = 'done' and result_hidden_at is null;
