import { supabase } from './supabase';
import { detectEnv, evaluatePush, urlBase64ToUint8Array, type PushVerdict } from './pushSupport';

export { detectEnv, evaluatePush } from './pushSupport';
export type { PushVerdict, PushEnv, PushState } from './pushSupport';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export interface PushStatus {
  verdict: PushVerdict;
  permission: NotificationPermission | 'tidak-ada';
  /** Perangkat ini punya langganan aktif yang tercatat di database. */
  subscribed: boolean;
  /** VAPID public key belum diisi di .env.local. */
  vapidMissing: boolean;
}

async function registerSW(): Promise<ServiceWorkerRegistration> {
  // Path relatif — build memakai base './', jadi ini benar baik di root
  // maupun di subdirektori GitHub Pages.
  const reg = await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

/** Daftarkan service worker tanpa menyentuh izin notifikasi. */
export async function ensureServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await registerSW();
  } catch {
    /* SW gagal daftar bukan alasan app tidak boleh jalan */
  }
}

export async function readStatus(): Promise<PushStatus> {
  const verdict = evaluatePush(detectEnv());
  const permission = 'Notification' in window ? Notification.permission : 'tidak-ada';

  let subscribed = false;
  if (verdict.state === 'siap' && permission === 'granted' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      subscribed = !!(await reg?.pushManager.getSubscription());
    } catch {
      subscribed = false;
    }
  }

  return { verdict, permission, subscribed, vapidMissing: !VAPID };
}

/**
 * Minta izin lalu daftarkan langganan. WAJIB dipanggil dari dalam handler
 * klik — browser menolak permintaan izin yang tidak berasal dari gestur user.
 */
export async function enablePush(): Promise<void> {
  if (!VAPID) {
    throw new Error(
      'VITE_VAPID_PUBLIC_KEY belum diisi di .env.local. Jalankan: npx web-push generate-vapid-keys',
    );
  }

  const izin = await Notification.requestPermission();
  if (izin !== 'granted') {
    throw new Error(
      izin === 'denied'
        ? 'Izin notifikasi ditolak. Web tidak bisa meminta ulang — reset lewat pengaturan browser, atau hapus PWA dari Home Screen lalu pasang lagi.'
        : 'Izin notifikasi belum diberikan.',
    );
  }

  await subscribeNow();
}

async function subscribeNow(): Promise<void> {
  const reg = await registerSW();

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID as string) as BufferSource,
    }));

  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent.slice(0, 300),
      last_seen_at: new Date().toISOString(),
      failed_count: 0,
      disabled_at: null,
    },
    { onConflict: 'endpoint' },
  );

  if (error) throw error;
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/**
 * Dipanggil tiap app dibuka.
 *
 * iOS bisa membuang langganan diam-diam — PWA di-install ulang, lama tidak
 * dibuka, atau Safari membersihkan datanya. Izinnya tetap `granted`, tapi
 * langganannya hilang dan notifikasi berhenti tanpa tanda apa pun. Itu mode
 * gagal terburuk untuk app pengingat, jadi kalau izin masih ada tapi
 * langganannya lenyap, daftarkan ulang tanpa mengganggu user.
 */
export async function resubscribeIfNeeded(): Promise<void> {
  if (!VAPID) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) {
      await subscribeNow();
      return;
    }

    // Langganan masih ada — perbarui jejak terakhir supaya baris yang sudah
    // lama tidak terlihat bisa dibedakan dari yang aktif.
    await supabase
      .from('push_subscriptions')
      .update({ last_seen_at: new Date().toISOString(), failed_count: 0, disabled_at: null })
      .eq('endpoint', sub.endpoint);
  } catch {
    /* jangan pernah menghalangi app hanya karena push bermasalah */
  }
}
