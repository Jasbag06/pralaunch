/**
 * Cermin dari src/lib/date.ts.
 *
 * Sengaja diduplikasi, bukan di-import: Edge Function berjalan di Deno dan
 * hanya membundel isi supabase/functions/. Menarik file dari src/ akan gagal
 * saat deploy. Fungsinya sedikit dan jarang berubah — kalau salah satunya
 * diubah, ubah keduanya.
 */

export const TZ = 'Asia/Jakarta';

/** 'YYYY-MM-DD' untuk hari ini di Asia/Jakarta. */
export function todayJakarta(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Jam 0–23 di Asia/Jakarta. */
export function hourJakarta(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return h === 24 ? 0 : h;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function daysBetween(from: string, to: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}
