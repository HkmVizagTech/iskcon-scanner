// Service Worker for ISKCON Scanner PWA
const CACHE_NAME = "iskcon-scanner-v1";

const urlsToCache = [
  "/",
  "/scan",
  "/history",
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
];

// Install service worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    }),
  );
});

// Activate service worker
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});

// Fetch strategy: Network first, fallback to cache
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request);
      }),
  );
});
