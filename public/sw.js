// Service Worker — network-first for all app pages
// Forces fresh content on every load so new deployments are always picked up

const CACHE_NAME = 'iskcon-scanner-v3';

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

  // Always go to network for navigation (page loads) and Next.js JS chunks
  // This guarantees new deployments are picked up immediately
  if (
    event.request.mode === 'navigate' ||
    url.pathname.startsWith('/_next/') ||
    url.pathname === '/' ||
    url.pathname.startsWith('/scan') ||
    url.pathname.startsWith('/history')
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request)
      )
    );
    return;
  }

  // Cache-first for static assets (icons, fonts)
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
