/**
 * Tema terang / gelap / ikut sistem.
 *
 * Kontrak CSS-nya ada di styles/tokens.css:
 *   data-theme="dark"   -> gelap
 *   data-theme="light"  -> terang (mengalahkan prefers-color-scheme sistem)
 *   tanpa atribut        -> ikut prefers-color-scheme
 *
 * Modul ini cuma menaruh/mencabut atribut itu di <html> dan menyimpan pilihan
 * di localStorage. Anti-kedip saat load ditangani oleh <script> inline kecil
 * di index.html yang jalan sebelum CSS melukis.
 */

import { useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'pralaunch-theme';

/** Warna <meta name="theme-color"> — bilah status browser & PWA. */
const BAR: Record<'light' | 'dark', string> = {
  light: '#ffffff',
  dark: '#191919',
};

function readStored(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // localStorage bisa melempar di private mode / thumbnail capture
  }
  return 'system';
}

const darkMedia = () =>
  typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Tema efektif setelah 'system' diselesaikan ke kondisi OS saat ini. */
export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return darkMedia()?.matches ? 'dark' : 'light';
}

function apply(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);

  // Meta statis di index.html cuma mengikuti prefers-color-scheme. Kalau user
  // meng-override manual, warna bilah harus disetel di sini.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = BAR[resolveTheme(pref)];
}

// ------------------------------------------------------------- store -------

let current: ThemePref = 'system';
const listeners = new Set<() => void>();

/** Panggil sekali dari main.tsx sebelum render. */
export function initTheme(): void {
  current = readStored();
  apply(current);

  // Kalau user memilih 'system' dan OS-nya ganti mode, ikut berubah.
  darkMedia()?.addEventListener?.('change', () => {
    if (current === 'system') apply('system');
  });
}

export function setThemePref(next: ThemePref): void {
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // tetap terapkan walau gagal disimpan
  }
  apply(next);
  listeners.forEach((l) => l());
}

/** Hook: preferensi tersimpan ('light' | 'dark' | 'system'). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}
