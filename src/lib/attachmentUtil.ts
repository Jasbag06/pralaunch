/**
 * Bagian murni dari logika lampiran — sengaja terpisah dari attachments.ts
 * yang mengimpor client Supabase. Tanpa pemisahan ini, validasi URL dan
 * pembersihan nama file tidak bisa diuji tanpa menyalakan koneksi.
 */

/** Batas app-level. Bucket juga membatasi 10 MB, tapi menolak lebih awal di
 *  client memberi pesan yang jelas ketimbang error mentah dari server. */
export const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Hanya http/https yang boleh disimpan.
 *
 * `javascript:` dan `data:` ditolak karena chip lampiran itu tombol yang
 * membuka URL-nya — link seperti itu akan dieksekusi di origin app saat
 * diklik. Database punya constraint yang sama sebagai lapis kedua.
 */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\/\S/i.test(url.trim());
}

/** Nama tampilan default untuk link tanpa label: hostname-nya. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Nama file yang aman dipakai sebagai path Storage.
 * Supabase menolak sebagian karakter, dan spasi/aksen bikin URL berantakan.
 * Ekstensi dipertahankan supaya browser tahu cara membukanya.
 */
export function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const punyaExt = dot > 0 && dot < name.length - 1;
  const base = punyaExt ? name.slice(0, dot) : name;
  const ext = punyaExt ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';

  const clean =
    base
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'file';

  return ext ? `${clean}.${ext}` : clean;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Kedua pemisah path, ditulis lewat kode karakter supaya tidak bergantung
 *  pada bagaimana backslash lolos dari editor atau shell. */
const SEP_WIN = String.fromCharCode(92); // \
const SEP_POSIX = '/';

/**
 * Pisahkan path lokal jadi nama file dan foldernya, untuk ditampilkan di chip.
 * Menerima pemisah Windows maupun POSIX — kamu bisa menempel dari Explorer
 * atau Finder tanpa perlu peduli bedanya.
 */
export function splitPath(p: string): { name: string; folder: string } {
  let norm = p.trim();
  while (norm.endsWith(SEP_WIN) || norm.endsWith(SEP_POSIX)) {
    norm = norm.slice(0, -1);
  }

  const i = Math.max(norm.lastIndexOf(SEP_WIN), norm.lastIndexOf(SEP_POSIX));
  return i < 0
    ? { name: norm, folder: '' }
    : { name: norm.slice(i + 1), folder: norm.slice(0, i) };
}
