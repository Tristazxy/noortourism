// Offline cache for Kitabu cha Wageni.
// Same-origin files: network first, cached copy when offline.
// Libraries from cdn.jsdelivr.net: cache first (they are version-pinned).
// AI model files from Hugging Face are cached by the AI library itself.

const SHELL = 'kitabu-shell-v2';
const LIBS = 'kitabu-libs-v1';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png',
  './data/demo.json', './print/guestbook.html', './print/sales-log.html', './print/print.css',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => Promise.all(PRECACHE.map(u => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('kitabu-') && k !== SHELL && k !== LIBS).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/data/bookings.json')) return; // live booking feed: never serve a stale copy
    event.respondWith(networkFirst(req));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const index = (await cache.match('./index.html')) || (await cache.match('./'));
      if (index) return index;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
