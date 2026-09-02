const CACHE_NAME = 'atelier-francais-v3';
const PRECACHE_URLS = [
  './',
  'index.html',
  'assets/styles.css',
  'assets/app.js',
  'assets/content-parser.js',
  'assets/analytics-utils.js',
  'assets/manifest.webmanifest',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/favicon.png'
];

self.addEventListener('install', event => {
  const toCache = PRECACHE_URLS.map(url => new URL(url, self.location).href);
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(toCache)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Navigation requests: network first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(request) || await caches.match(new URL('index.html', self.location)) || await caches.match(new URL('./', self.location)) || await caches.match('/French/') || await caches.match('/French/index.html');
        return cached || Response.error();
      })
    );
    return;
  }

  // For assets / content / data: cache-first, network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // cache successful responses for app assets
        if (response.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/content/') || url.pathname.includes('/data/'))) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});