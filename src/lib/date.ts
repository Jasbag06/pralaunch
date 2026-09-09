/**
 * SATU-SATUNYA tempat logika tanggal di app ini.
 *
 * Aturan yang tidak boleh dilanggar: tidak ada aritmetika tanggal dengan
 * `new Date()` mentah di file lain. Semua tanggal beredar sebagai string
 * polos 'YYYY-MM-DD' — bentuk yang sama dengan kolom `date` di Postgres.
 *
 * Alasannya: browser bisa berada di timezone mana saja (dan Vitest berjalan
 * di UTC). Kalau "hari ini" diambil dari waktu lokal, task muncul overdue
 * sehari lebih cepat atau reminder telat sehari — bug klasik yang justru
 * fatal di app pengingat.
 */

export const TZ = 'Asia/Jakarta';

/** Tanggal ISO polos, tanpa komponen waktu. Contoh: '2026-09-08'. */
export type IsoDate = string;

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const BULAN_PENDEK = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Ubah 'YYYY-MM-DD' jadi milidetik UTC tengah malam. Murni, tanpa timezone lokal. */
function utcMs(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): IsoDate {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// ---------------------------------------------------------------- sekarang --

/**
 * 'YYYY-MM-DD' untuk hari ini di Asia/Jakarta, apa pun timezone perangkat.
 * Locale 'en-CA' dipilih karena format defaultnya persis ISO.
 */
export function todayJakarta(now: Date = new Date()): IsoDate {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Jam 0–23 di Asia/Jakarta. Dipakai Edge Function untuk memutuskan jam kirim. */
export function hourJakarta(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const raw = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const h = Number(raw);
  // Sebagian engine mengembalikan '24' untuk tengah malam, bukan '00'.
  return h === 24 ? 0 : h;
}

/**
 * Tanggal Jakarta dari sebuah timestamptz (mis. `completed_at` dari database).
 * Tanpa ini, task yang diselesaikan jam 8 malam WIB akan terhitung di hari
 * berikutnya kalau dibandingkan sebagai UTC.
 */
export function jakartaDateOf(ts: string): IsoDate {
  return todayJakarta(new Date(ts));
}

// ------------------------------------------------------------- aritmetika --

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(utcMs(date) + days * 86_400_000);
}

/** Selisih hari, `to` dikurangi `from`. Negatif berarti `to` sudah lewat. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utcMs(to) - utcMs(from)) / 86_400_000);
}

/** 0 = Minggu … 6 = Sabtu. */
export function weekday(date: IsoDate): number {
  return new Date(utcMs(date)).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const d = weekday(date);
  return d === 0 || d === 6;
}

/**
 * Hari akhir pekan berikutnya SETELAH `date` — tombol "geser ke weekend
 * terdekat". Selalu maju: dari Sabtu jatuh ke Minggu, dari Minggu jatuh ke
 * Sabtu berikutnya. Tidak pernah mengembalikan tanggal yang sama.
 */
export function nextWeekend(date: IsoDate): IsoDate {
  let d = addDays(date, 1);
  while (!isWeekend(d)) d = addDays(d, 1);
  return d;
}

// -------------------------------------------------------------- tampilan --

/** '08 Sep' */
export function fmtShort(date: IsoDate): string {
  const [, m, d] = date.split('-').map(Number);
  return `${pad(d)} ${BULAN_PENDEK[m - 1]}`;
}

/** 'Sel, 08 Sep 2026' */
export function fmtDayShort(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${HARI_PENDEK[weekday(date)]}, ${pad(d)} ${BULAN_PENDEK[m - 1]} ${y}`;
}

/** 'Selasa, 08 September 2026' */
export function fmtFull(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${HARI[weekday(date)]}, ${pad(d)} ${BULAN[m - 1]} ${y}`;
}

/** '01–07 Sep', '29 Sep–06 Okt' kalau melintasi bulan, '05 Okt' kalau satu hari. */
export function fmtRange(from: IsoDate, to: IsoDate): string {
  if (from === to) return fmtShort(from);

  const [, mFrom, dFrom] = from.split('-').map(Number);
  const [, mTo, dTo] = to.split('-').map(Number);
  return mFrom === mTo
    ? `${pad(dFrom)}–${pad(dTo)} ${BULAN_PENDEK[mTo - 1]}`
    : `${pad(dFrom)} ${BULAN_PENDEK[mFrom - 1]}–${pad(dTo)} ${BULAN_PENDEK[mTo - 1]}`;
}

/** '2j 45m', '45m', '2j'. Untuk estimasi & total waktu. */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}j`;
  return `${h}j ${m}m`;
}
