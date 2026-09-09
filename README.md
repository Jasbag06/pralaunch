# Pra-Launch

Task tracker untuk 30 hari persiapan sebelum barang impor tiba. PWA, dipasang ke
home screen, dengan reminder harian.

Proyek terpisah dari **ARUS** (buku besar operasional impor) yang ada di folder
induk. Bahasa visualnya sengaja diwarisi dari sana — lihat
[`mockup/dashboard.html`](mockup/dashboard.html).

---

## Status

| Tahap | Isi | Status |
|---|---|---|
| 0 | Mockup statis Dasbor (mobile + desktop) | ✅ |
| 1 | Scaffold, skema database, auth | ✅ |
| 2 | Jadwal awal 30 hari (`seed/jadwal-30-hari.json`) | ✅ |
| 3 | Dashboard, Timeline, Detail/Edit task | ✅ |
| 4 | Import/Export JSON, Progres | ✅ |
| 5 | PWA, push notification, fallback email | ✅ |
| 6 | Deploy GitHub Pages | ✅ |

---

## Setup pertama kali

### 1. Buat Supabase project khusus

Project ini harus **terpisah dari project ARUS** — keduanya memakai nama tabel
`app_settings`, jadi kalau digabung akan bentrok langsung.

Free tier Supabase membatasi 2 project aktif per akun. Kalau slot di akun utama
sudah penuh, project ini boleh dibuat di akun Supabase lain; tidak ada yang
mengikat app ini ke akun tertentu selain isi `.env.local`.

### 2. Jalankan migrasi

Supabase Dashboard → **SQL Editor** → tempel dan jalankan berurutan:

1. [`0001_init.sql`](supabase/migrations/0001_init.sql) — tabel, constraint, trigger
2. [`0002_rls.sql`](supabase/migrations/0002_rls.sql) — Row Level Security
3. [`0003_attachments.sql`](supabase/migrations/0003_attachments.sql) — lampiran + bucket Storage
4. [`0004_attachment_path.sql`](supabase/migrations/0004_attachment_path.sql) — jenis lampiran `path`


### 3. Buat user

Dashboard → **Authentication → Users → Add user**. Isi email + password, dan
centang *Auto Confirm User*.

Halaman login sengaja tidak punya tombol daftar: app ini live di URL publik, dan
pendaftaran terbuka cuma menambah permukaan yang tidak dibutuhkan app satu orang.

### 4. Isi environment

```bash
cp .env.example .env.local
```

Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari
Dashboard → **Project Settings → API Keys**. Pakai key **publishable**
(`sb_publishable_…`) — format baru Supabase, pengganti anon key JWT `eyJ…` yang
lama. Keduanya masih diterima.

> `.env.local` sudah masuk `.gitignore`. Key publishable aman ikut ter-bundle di
> JS — RLS yang menjaga datanya, bukan kerahasiaan key. Yang **tidak boleh**
> masuk ke kode client adalah key `sb_secret_…` (service role).

### 5. Jalankan

```bash
npm install
npm run dev
```

---

## Perintah

```bash
npm run dev        # dev server
npm run build      # typecheck + build produksi ke dist/
npm run typecheck  # tsc --noEmit saja
npm test           # vitest sekali jalan
npm run test:watch # vitest mode watch
```

---

## Aturan yang berlaku di seluruh kode

**Tanggal.** Semua logika tanggal lewat [`src/lib/date.ts`](src/lib/date.ts).
Tidak ada aritmetika tanggal dengan `new Date()` mentah di file lain, dan tidak
ada `current_date` di SQL untuk logika bisnis. Tanggal beredar sebagai string
`'YYYY-MM-DD'`.

Alasannya: server Supabase berjalan di UTC dan browser bisa di timezone mana
saja. Kalau "hari ini" diambil dari waktu lokal, task muncul overdue sehari
lebih cepat atau reminder telat sehari — di app pengingat itu fatal.

**Warna.** Tidak ada warna literal di komponen. Semua lewat variabel di
[`src/styles/tokens.css`](src/styles/tokens.css), supaya light/dark dan
konsistensi dengan ARUS terjaga dari satu tempat.

**Kunci task.** `tasks.key` adalah slug stabil (`w1-nib-daftar`). Ia jangkar
untuk import JSON yang idempoten sekaligus isi dari `depends_on` — yang menyimpan
**key**, bukan uuid. JSON yang kamu bawa dari chat tidak punya uuid, dan mode
`replace_week` membuat ulang baris dengan uuid baru; dependensi berbasis uuid
pasti putus. Key gantung dijaga trigger di `0001_init.sql`.

---

## Struktur

```
src/
  lib/
    date.ts        satu-satunya sumber logika tanggal (+ date.test.ts)
    tasks.ts       logika murni Dashboard: overdue, siap, terkunci, progres
                   (+ tasks.test.ts)
    tasksApi.ts    baca/tulis tasks & milestones + terapkan impor
    push.ts        daftar/hapus langganan push, resubscribe otomatis
    pushSupport.ts deteksi dukungan (murni) (+ pushSupport.test.ts)
    importer.ts    validasi JSON, peta nomor baris, rencana impor, ekspor
                   (+ importer.test.ts)
    attachments.ts upload/link lampiran + signed URL
    attachmentUtil.ts  bagian murni: validasi URL, nama file aman
                   (+ attachmentUtil.test.ts)
    supabase.ts    client, sesi persist untuk PWA
    settings.ts    baca/tulis app_settings singleton
    types.ts       cermin skema database
  styles/
    tokens.css     palet, tipografi — diangkat dari mockup
    auth.css       layar login, loading, error fatal
    components.css shell, baris task, callout, meter — diangkat dari mockup
  components/
    Login.tsx
    Shell.tsx      sidebar desktop / bottom nav mobile
    Dashboard.tsx  empat blok + rail kanan
    Timeline.tsx   per minggu, collapsible, penanda milestone
    TaskSheet.tsx  detail/edit/tambah/hapus + geser cepat
    TaskRow.tsx    baris task yang bisa dicentang
    Attachments.tsx  pengelola lampiran di panel detail
    ImportPage.tsx   tempel JSON, validasi, preview, terapkan
    ExportPage.tsx   salin / unduh seluruh task
    ProgressPage.tsx per minggu, per workstream, riwayat mingguan
    SettingsPage.tsx jadwal, jam reminder, status push, fallback email
  dev/
    fixtures.ts    data contoh untuk #/preview — DEV saja, tidak ikut produksi
  App.tsx          gerbang sesi + routing hash
.github/workflows/deploy.yml   build + deploy otomatis ke GitHub Pages
public/
  .nojekyll             supaya GitHub Pages tidak menyaring file berawalan _
  manifest.webmanifest  PWA
  sw.js                 service worker: cache shell + handler push
  icon.svg / icon-maskable.svg / apple-touch-icon.png
supabase/functions/
  _shared/waktu.ts      cermin src/lib/date.ts (Deno tidak bisa impor src/)
  _shared/pesan.ts      penyusun isi pengingat (+ pesan.test.ts)
  send-reminders/       Edge Function yang dipanggil pg_cron
supabase/cron.sql       jadwal pg_cron — EDIT dulu, bukan migrasi
supabase/migrations/
  0001_init.sql    tabel, constraint, trigger
  0002_rls.sql     Row Level Security
  0003_attachments.sql  lampiran + bucket Storage privat
  0004_attachment_path.sql  jenis lampiran 'path' (catatan lokasi)
mockup/
  dashboard.html   mockup statis yang di-approve, acuan Dashboard
```

### Pratinjau tanpa data

Saat `npm run dev` jalan:

- `#/preview` — Dashboard
- `#/preview-timeline` — Timeline
- `#/preview-progres` — Progres
- `#/preview-impor` — Impor JSON (validasi jalan; terapkan diblokir)
- `#/preview-ekspor` — Ekspor JSON
- `#/preview-pengaturan` — Pengaturan (status push dibaca dari browser sungguhan)

Tidak perlu login maupun seed, dan semua perubahan cuma di memori. Rute ini
hanya ada di dev; fixture-nya di-import dinamis jadi tidak ikut ke bundle
produksi.

---

## Lampiran task

Tiap task bisa punya campuran tiga jenis lampiran, dan semuanya muncul sebagai
chip di daftar task — bisa dipakai langsung tanpa masuk ke detail dulu.

**File** — di-upload ke bucket Storage privat `lampiran` (maks 10 MB). Salinan
yang ikut ke task dan bisa dibuka dari HP, iPad, maupun laptop. Cocok untuk yang
sekali jadi: scan KTP, NPWP, foto produk.

**Link** — URL ke Google Drive / OneDrive / Sheet. Kalau file-nya ada di folder
yang tersinkron, link selalu menunjuk versi terbaru. **Ini satu-satunya jalur
yang memberi perilaku "saya save di folder, app ikut ter-update"** — yang
menyinkronkan Drive-nya, bukan browser. Cocok untuk dokumen yang sering
direvisi.

**Lokasi** — catatan teks seperti `D:\proyek
iset\harga-v3.xlsx`. Chip
menampilkan nama file-nya saja; diklik untuk **menyalin** path ke clipboard,
lalu tinggal tempel di Explorer. Sengaja tidak bisa dibuka langsung: browser
memblokir link `file://` dari halaman http, dan path Windows tidak berarti
apa-apa di iPad. Gunanya semata supaya kamu tidak perlu mengingat-ingat hasil
kerja kemarin ditaruh di mana.

Browser **tidak bisa** memantau folder lokal lalu menyimpan balik ke sana.
File System Access API cuma ada di Chrome/Edge desktop dan tidak ada sama sekali
di iOS, jadi tidak dipakai.

Bucket-nya privat: file hanya bisa dibuka lewat signed URL berumur 1 jam yang
diterbitkan setelah login. Kalau bucket ini publik, siapa pun yang menebak path
bisa mengunduh scan KTP.

---

## Impor & Ekspor JSON

Alurnya dirancang untuk satu kebiasaan: minta bantuan menyusun task lewat chat,
tempel hasilnya, revisi, ulangi.

**Ekspor** membuang field internal (`id`, `owner_id`, timestamp) dan mengurutkan
per minggu lalu tanggal. Hasilnya bisa langsung dibawa ke chat, direvisi, dan
dikembalikan lewat Impor tanpa diedit manual — round-trip ini ada test-nya.

**Impor** memvalidasi tiap elemen dan melaporkan **nomor baris** di teks yang
kamu tempel, bukan sekadar "elemen ke-7". Selama masih ada error, tombol
Terapkan tidak muncul. Field yang tidak dikenal cuma jadi peringatan — biasanya
itu salah ketik nama field, bukan alasan membatalkan seluruh impor.

Dua mode:

### Jadwal awal

[`seed/jadwal-30-hari.json`](seed/jadwal-30-hari.json) berisi 43 task dan 5
milestone, 9 Sep – 13 Okt 2026, dengan barang tiba 6 Oktober. Buka, salin
seluruh isinya, tempel di halaman **Impor**, mode **Tambah**.

Isinya dijaga oleh [`src/lib/seedJadwal.test.ts`](src/lib/seedJadwal.test.ts) —
kalau kamu mengeditnya, test itu menangkap dependensi melingkar, task yang
bergantung pada sesuatu yang dijadwalkan lebih lambat, dan hari yang beban
estimasinya tidak masuk akal.

### Dua bentuk JSON

Impor menerima **array task polos**, atau **objek** yang memuat milestone juga:

```json
{ "tasks": [ ... ], "milestones": [ ... ] }
```

Milestone selalu ditambah/diperbarui dan **tidak pernah dihapus**, bahkan di
mode ganti-per-minggu — jumlahnya sedikit dan stabil, jadi menghapusnya karena
satu minggu di-replace akan mengejutkan dan sulit dibatalkan.

| Mode | Yang terjadi |
|---|---|
| **Tambah** | Key yang sudah ada diperbarui, sisanya dibuat. Tidak ada yang dihapus. |
| **Ganti per minggu** | Minggu yang muncul di JSON dibuat sama persis dengan isi JSON. |

`Ganti per minggu` **tidak** menghapus-lalu-membuat-ulang seluruh minggu. Task
yang key-nya ada di payload diperbarui di tempat; hanya yang tidak lagi disebut
yang dihapus. Kalau dihapus dulu, lampirannya ikut terhapus (`attachments` punya
`on delete cascade`) dan `completed_at`-nya hilang — padahal task-nya sebenarnya
masih ada.

Preview selalu menyebut **key mana saja yang akan dihapus** dan berapa lampiran
yang ikut hilang, sebelum apa pun ditulis. Impor bukan satu transaksi
(PostgREST tidak menyediakannya), jadi untuk perubahan besar sebaiknya Ekspor
dulu sebagai cadangan.

---

## Pengingat: PWA, push, dan email

### Cara kerjanya

```
pg_cron (tiap 15 menit, UTC)
  -> pg_net http_post  ->  Edge Function send-reminders   [x-cron-secret]
        |
        +- hitung jam sekarang di Asia/Jakarta
        +- cocok dengan reminder_hour? sudah ada di notification_log hari ini?
        +- rakit ringkasan dari tasks + milestones
        +- kirim ke tiap push_subscriptions (VAPID)
        |     +- balasan 404/410 -> matikan langganan itu
        +- kalau email_fallback_enabled -> Resend
        +- tulis notification_log
```

Cron sering, tapi **function yang memutuskan** apakah sudah waktunya. pg_cron
menyimpan jadwal statis dalam UTC; kalau jam reminder dipatok di sana, mengubah
jamnya lewat Pengaturan tidak berpengaruh sampai kamu ingat masuk SQL editor.
Biayanya 96 pemanggilan/hari — jauh di bawah kuota gratis.

### Setup (sekali)

**1. Hasilkan kunci VAPID**

```bash
npx web-push generate-vapid-keys
```

**2. Public key ke `.env.local`**

```
VITE_VAPID_PUBLIC_KEY=B...
```

Aman ikut ter-bundle — kunci ini memang dirancang publik.

**3. Secret Edge Function** — Dashboard → Edge Functions → Secrets:

| Nama | Isi |
|---|---|
| `VAPID_PUBLIC_KEY` | public key dari langkah 1 |
| `VAPID_PRIVATE_KEY` | private key dari langkah 1 — **jangan** ke `.env.local` |
| `VAPID_SUBJECT` | `mailto:emailkamu@contoh.id` |
| `CRON_SECRET` | string acak buatanmu |
| `RESEND_API_KEY` | opsional, untuk fallback email |

**4. Deploy function**

```bash
supabase functions deploy send-reminders --no-verify-jwt
```

`--no-verify-jwt` karena cron memanggil tanpa JWT user; pengamannya header
`CRON_SECRET`.

**5. Uji manual dulu, sebelum pasang cron**

```bash
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders" -H "x-cron-secret: <CRON_SECRET>"
```

Balasannya JSON berisi `today`, `jam`, dan `laporan`. Panggil dua kali — kiriman
kedua harus dilewati karena `notification_log` sudah mencatatnya.

**6. Pasang cron** — buka [`supabase/cron.sql`](supabase/cron.sql), ganti dua
tempat bertanda `GANTI`, lalu jalankan di SQL Editor.

### Kenyataan iOS

Halaman Pengaturan mendeteksi dan menjelaskan ini sendiri, tapi ringkasnya:

1. Web Push butuh **iOS 16.4+ DAN PWA sudah di-install ke Home Screen**. Di tab
   Safari biasa `window.Notification` bahkan tidak ada.
2. Izin wajib diminta dari **tap tombol**, tidak bisa otomatis saat load.
3. Sekali ditolak, web **tidak bisa** meminta ulang — harus reset lewat
   Settings iOS, atau hapus PWA lalu pasang ulang.
4. iOS bisa **membuang langganan diam-diam**. Izin tetap `granted` tapi
   notifikasi berhenti tanpa tanda apa pun. Karena itu `resubscribeIfNeeded()`
   berjalan tiap app dibuka.
5. Pengiriman tidak dijamin instan. Ini pengingat, bukan alarm.

Karena semua itu, **fallback email bukan pelengkap — itu jaring pengamannya.**

Catatan Resend: di tier gratis tanpa domain terverifikasi, pengiriman hanya bisa
dari `onboarding@resend.dev` ke alamat pemilik akun Resend. Untuk mengingatkan
diri sendiri itu cukup.

### Yang belum bisa diverifikasi dari sini

Pengiriman push sungguhan butuh kunci VAPID asli, function yang sudah ter-deploy,
dan perangkat yang sudah memasang PWA — jadi itu hanya bisa kamu buktikan
sendiri lewat langkah 5 dan 6 di atas. Yang **sudah** terverifikasi: service
worker terdaftar dan aktif, manifest valid, deteksi dukungan (16 test), dan
penyusun isi pesan (14 test).

Satu titik yang perlu kamu perhatikan saat deploy: Edge Function memakai
`npm:web-push`. Kalau Deno menolaknya, log function akan menunjukkannya di
langkah 5 — kirim errornya ke saya dan saya ganti ke pustaka push Deno-native.

---

## Deploy ke GitHub Pages

Folder **`pralaunch/` inilah root repo-nya**, bukan `bikin app/`. Repo bernama
`pralaunch`, jadi app-nya nanti live di:

```
https://<username>.github.io/pralaunch/
```

### Sekali saja

**1. Jadikan folder ini repo**

```bash
cd "D:/bikin app/pralaunch" && git init -b main && git add . && git commit -m "Pra-Launch: task tracker 30 hari"
```

**2. Buat repo `pralaunch` di GitHub, lalu hubungkan**

```bash
git remote add origin https://github.com/<username>/pralaunch.git && git push -u origin main
```

**3. Isi secret** — Settings → Secrets and variables → **Actions** → New
repository secret:

| Nama | Isi |
|---|---|
| `VITE_SUPABASE_URL` | URL project Supabase |
| `VITE_SUPABASE_ANON_KEY` | key `sb_publishable_…` |
| `VITE_VAPID_PUBLIC_KEY` | public key VAPID |

Ketiganya memang berakhir publik di dalam bundle JS — itu wajar dan aman. Yang
menjaga data tetap **RLS**, bukan kerahasiaan key. Menaruhnya sebagai secret
bukan untuk merahasiakan, melainkan supaya nilainya tidak ikut ter-commit dan
gampang diganti tanpa mengedit kode.

**4. Nyalakan Pages** — Settings → Pages → **Source: GitHub Actions**.

Selesai. Tiap `git push` ke `main` akan menjalankan test, typecheck, build, lalu
deploy. Kalau test gagal, tidak ada yang ter-deploy.

### Setelah live

1. Buka URL-nya di **Safari** di iPhone/iPad.
2. Tombol Bagikan → **Add to Home Screen**.
3. Buka dari ikon Home Screen (bukan dari tab Safari).
4. Pengaturan → **Nyalakan notifikasi**.

Langkah 3 tidak bisa dilewat: di iOS, Web Push hanya ada kalau PWA dijalankan
sebagai app terinstal.

### Catatan

**Repo publik.** GitHub Pages untuk repo privat butuh GitHub Pro. Kalau repo-nya
publik, isi `.env.local` tetap aman karena sudah masuk `.gitignore` — dan nilai
di dalamnya memang publik-by-design.

**Base path.** [`vite.config.ts`](vite.config.ts) memakai `base: './'`, bukan
`'/pralaunch/'`. Semua rujukan jadi relatif, jadi build yang sama jalan di root
maupun subdirektori — dan kalau suatu saat repo-nya kamu ganti nama, tidak ada
yang perlu diubah. Ini sudah diuji dengan menyajikan `dist/` dari subdirektori
sungguhan: aset, manifest, `start_url`, dan **scope service worker** semuanya
resolve ke `/pralaunch/`.

**Routing hash.** GitHub Pages tidak punya rewrite server, jadi refresh di
`/pralaunch/timeline` akan 404. Karena itu rutenya `#/timeline` — refresh di
rute mana pun tetap memuat `index.html` yang sama. Sudah diuji.
