const CACHE_NAME = 'atelier-francais-v9';
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
  'assets/icons/icon-1024.png',
  'assets/favicon.png',
  'assets/favicon-16.png',
  'assets/favicon-48.png',
  'assets/vendor/pdfjs/pdf.mjs',
  'assets/vendor/pdfjs/pdf.worker.mjs',
  'assets/vendor/jszip.min.js',
  'content/index.json',
  'content/library.json'
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

  // App content, manifest, library, vocab, analytics: network-first with cache fallback
  // so lesson/library updates propagate without manual cache resets.
  if (url.pathname.includes('/content/') || url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        return cached || Response.error();
      })
    );
    return;
  }

  // For static assets: cache-first, network fallback
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