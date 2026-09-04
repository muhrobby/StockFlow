/**
 * StockFlow Service Worker (PWA)
 * Ultra-lightweight & High-Speed Cache Engine for Warehouse Mobile Operations.
 *
 * Strategies:
 * 1. App Shell & Static Assets: Stale-While-Revalidate with Pre-caching (< 100ms instant load).
 * 2. Navigation: Instant cache response with background revalidation & offline fallback.
 * 3. CDN External Scripts (Lucide Icons, Html5Qrcode): Runtime caching.
 * 4. API & Webhooks (/webhook): Strictly Network-Only (preserves audit trail & offline QueueManager).
 */

const CACHE_NAME = 'stockflow-cache-v2';

// Core static assets required for instant boot
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/tailwind.min.css?v=1',
  './css/app.css?v=3',
  './js/config.js?v=4',
  './js/api.js?v=4',
  './js/auth.js?v=4',
  './js/audio.js?v=2',
  './js/scanner.js?v=5',
  './js/pwa.js?v=1',
  './js/app.js?v=18',
  './js/movement.js?v=7',
  './js/bulk-upload.js?v=1',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/favicon.ico'
];

// Install Event: Pre-cache static assets & immediately activate
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return Promise.all(
          PRECACHE_ASSETS.map((url) =>
            fetch(url, { cache: 'no-cache' })
              .then((response) => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              })
              .catch((err) => {
                console.warn('[SW] Precache skipped for:', url, err);
              })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Delete previous cache versions & claim all active clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log('[SW] Purging outdated cache:', cache);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event: Intelligent routing
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. NON-GET or API / Webhook requests:
  // Strictly Network Only! Never cache POST or n8n webhooks.
  // This ensures QueueManager and SearchCache retain complete control over business logic & audit ledger.
  if (
    request.method !== 'GET' ||
    url.pathname.includes('/webhook') ||
    url.searchParams.has('skip_cache')
  ) {
    return; // Pass through directly to browser network
  }

  // 2. Navigation Request (User opens or reloads the page)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cachedIndex) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const resClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put('./index.html', resClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback: return cachedIndex
            return cachedIndex;
          });

        // Serve instantly from cache if present (< 100ms perceived load), else wait network
        return cachedIndex || fetchPromise;
      })
    );
    return;
  }

  // 3. Static Assets & External Scripts (Lucide, App CSS, JS, Images, Icons)
  // Stale-While-Revalidate: Return cached response immediately, update cache in background
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const matchFallback = cachedResponse
        ? Promise.resolve(cachedResponse)
        : caches.match(request, { ignoreSearch: true });

      return matchFallback.then((finalCached) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              (networkResponse.status === 200 || networkResponse.type === 'opaque')
            ) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch((err) => {
            if (!finalCached) {
              throw err;
            }
          });

        return finalCached || fetchPromise;
      });
    })
  );
});
