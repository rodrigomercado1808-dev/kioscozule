const CACHE_NAME = 'kiosco-zule-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/firebase.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => { if(k !== CACHE_NAME) return caches.delete(k); }))).then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Bypass analytics or firebase long polling
  if(url.origin !== location.origin){
    // Try network first for external resources, fallback to cache
    event.respondWith(fetch(event.request).catch(()=> caches.match(event.request)));
    return;
  }
  // For same-origin assets: cache-first
  event.respondWith(caches.match(event.request).then(resp => resp || fetch(event.request).then(r => {
    return caches.open(CACHE_NAME).then(cache => { cache.put(event.request, r.clone()); return r; });
  })).catch(()=> caches.match('/index.html')));
});
