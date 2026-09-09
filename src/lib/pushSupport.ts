/**
 * Deteksi dukungan Web Push — bagian murninya, terpisah dari kode yang
 * menyentuh browser, supaya semua cabang iOS bisa diuji.
 *
 * Kenyataan yang harus ditangani jujur, bukan disembunyikan:
 *
 *   1. Di iOS, Web Push HANYA jalan kalau PWA sudah di-install ke Home Screen
 *      (iOS 16.4+). Di Safari biasa `window.Notification` bahkan tidak ada.
 *   2. Izin wajib diminta dari tap tombol, tidak bisa otomatis saat load.
 *   3. Sekali ditolak, web tidak bisa meminta ulang. Harus lewat Settings iOS,
 *      atau hapus PWA dari home screen lalu install ulang.
 *
 * Kalau ini tidak dibedakan, user cuma melihat tombol yang tidak bekerja dan
 * tidak tahu harus berbuat apa.
 */

export interface PushEnv {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  /** Dibuka sebagai PWA terinstal, bukan di dalam tab browser. */
  isStandalone: boolean;
  isIOS: boolean;
  /** Versi mayor.minor iOS sebagai angka, mis. 16.4. null kalau bukan iOS. */
  iosVersion: number | null;
}

export type PushState =
  /** Semua syarat terpenuhi — tombol "Nyalakan" boleh ditampilkan. */
  | 'siap'
  /** Perangkat/browser ini memang tidak bisa. */
  | 'tidak-didukung'
  /** Bisa, tapi PWA-nya harus di-install ke Home Screen dulu. */
  | 'perlu-install'
  /** iOS-nya terlalu lama. */
  | 'ios-terlalu-lama';

export interface PushVerdict {
  state: PushState;
  alasan: string;
  /** Langkah konkret yang bisa dilakukan user, kalau ada. */
  langkah?: string[];
}

/** iOS 16.4 adalah versi pertama yang mendukung Web Push untuk PWA. */
export const IOS_MIN = 16.4;

/**
 * Versi iOS dari user agent. iPadOS 13+ menyamar sebagai Mac, jadi pemanggil
 * yang mendeteksi iPad lewat touch points tetap bisa dapat null di sini —
 * itu ditangani sebagai "tidak diketahui", bukan "terlalu lama".
 */
export function parseIosVersion(ua: string): number | null {
  const m = /(?:iPhone |CPU )OS (\d+)[._](\d+)/.exec(ua);
  if (!m) return null;
  return Number(`${m[1]}.${m[2]}`);
}

export function evaluatePush(env: PushEnv): PushVerdict {
  // Di iOS, ketiadaan API bukan berarti perangkatnya tidak mampu — sering kali
  // cuma karena belum di-install. Itu dua pesan yang sangat berbeda.
  if (env.isIOS && !env.isStandalone) {
    return {
      state: 'perlu-install',
      alasan:
        'Di iPhone dan iPad, notifikasi hanya bekerja kalau app ini sudah dipasang ke Home Screen.',
      langkah: [
        'Buka halaman ini di Safari (bukan Chrome).',
        'Tekan tombol Bagikan, lalu pilih "Add to Home Screen".',
        'Buka app dari ikon di Home Screen, lalu kembali ke Pengaturan ini.',
      ],
    };
  }

  if (env.isIOS && env.iosVersion !== null && env.iosVersion < IOS_MIN) {
    return {
      state: 'ios-terlalu-lama',
      alasan: `Web Push butuh iOS ${IOS_MIN} ke atas. Perangkat ini di iOS ${env.iosVersion}.`,
      langkah: ['Perbarui iOS lewat Settings → General → Software Update.'],
    };
  }

  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return {
      state: 'tidak-didukung',
      alasan: 'Browser ini tidak menyediakan Web Push.',
      langkah: ['Nyalakan pengingat lewat email di bawah sebagai gantinya.'],
    };
  }

  return { state: 'siap', alasan: 'Perangkat ini bisa menerima notifikasi.' };
}

/** Baca kemampuan browser saat ini. Hanya boleh dipanggil di browser. */
export function detectEnv(): PushEnv {
  const ua = navigator.userAgent;

  // iPadOS 13+ melaporkan diri sebagai Macintosh. Pembeda yang andal adalah
  // adanya layar sentuh — Mac sungguhan maxTouchPoints-nya 0.
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS memakai properti non-standar ini, bukan display-mode.
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    isStandalone,
    isIOS,
    iosVersion: parseIosVersion(ua),
  };
}

/**
 * VAPID public key (base64url) -> Uint8Array untuk pushManager.subscribe.
 * Format yang diterima PushManager berbeda dari yang dihasilkan web-push,
 * jadi konversinya wajib.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
