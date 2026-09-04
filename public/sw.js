// Service Worker — network-first for all app pages and API calls
// Forces fresh content on every load so new deployments are always picked up

const CACHE_NAME = 'iskcon-scanner-v8';

self.addEventListener('install', (event) => {
  // Skip waiting immediately so the new SW activates right away
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete ALL old caches so stale JS/CSS is purged immediately
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for:
  //  - Navigation (page loads)
  //  - Next.js JS/CSS chunks
  //  - API calls (backend) — NEVER serve stale API data
  //  - App pages (scan, history, root)
  if (
    event.request.mode === 'navigate' ||
    url.pathname.startsWith('/_next/') ||
    url.pathname === '/' ||
    url.pathname.startsWith('/scan') ||
    url.pathname.startsWith('/history') ||
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request)
      )
    );
    return;
  }

  // Cache-first only for same-origin static assets (icons, fonts, manifest)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
