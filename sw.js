const CACHE_NAME = 'vault-cache-v9'; // Upgraded version pushes a clean memory overwrite
const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'https://unpkg.com', // Updated extension format
  'https://unpkg.com',
  'https://icons8.com'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});
