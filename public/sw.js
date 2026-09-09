/* Service worker Pra-Launch.
 *
 * Ditulis tangan, bukan lewat vite-plugin-pwa: kita tetap butuh handler `push`
 * dan `notificationclick` sendiri, jadi lapisan Workbox cuma menambah
 * konfigurasi tanpa menghemat apa pun.
 *
 * Yang di-cache HANYA app shell milik origin ini. Data datang dari Supabase
 * dan tidak boleh pernah masuk cache — daftar task basi jauh lebih berbahaya
 * daripada app yang butuh koneksi.
 */

const CACHE = 'pralaunch-v1';

self.addEventListener('install', (event) => {
  // Versi baru langsung dipakai; kalau menunggu semua tab tertutup, PWA yang
  // jarang ditutup bisa memakai versi lama berminggu-minggu.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nama = await caches.keys();
      await Promise.all(nama.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, font, dll: lewat

  // Navigasi: coba jaringan dulu supaya build baru langsung terpakai; kalau
  // offline, sajikan halaman terakhir yang berhasil dimuat.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put('shell', res.clone());
          return res;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match('shell')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Aset build punya nama ber-hash, jadi isinya tidak pernah berubah —
  // aman diambil dari cache lebih dulu.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;

      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })(),
  );
});

// ------------------------------------------------------------------ push ---

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const judul = data.title || 'Pra-Launch';
  const opsi = {
    body: data.body || '',
    icon: './icon.svg',
    badge: './icon.svg',
    // tag membuat notifikasi sejenis saling menimpa, bukan menumpuk —
    // tiga pengingat "task telat" beruntun cuma menambah kebisingan.
    tag: data.tag || 'pralaunch',
    renotify: true,
    data: { url: data.url || './' },
  };

  event.waitUntil(self.registration.showNotification(judul, opsi));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tujuan = new URL(event.notification.data?.url || './', self.location.href).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Kalau app-nya sudah terbuka, fokuskan yang itu daripada membuka
      // jendela kedua — di iOS jendela kedua sering muncul sebagai tab kosong.
      for (const c of clients) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          await c.focus();
          if ('navigate' in c) await c.navigate(tujuan);
          return;
        }
      }
      await self.clients.openWindow(tujuan);
    })(),
  );
});
