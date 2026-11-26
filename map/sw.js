// Keeps the States Worked Map working with no signal after the first visit.
// Files are served from the cache straight away and refreshed in the
// background, so an update shows up on the next visit.
// Bump VERSION when the list of files below changes.
const VERSION = 'states-map-v6';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'data/states.json',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
];
// Other sites the page needs: the K1KFX kit and its Google Fonts.
const OTHER_HOSTS = ['k1kfx.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('states-map-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.origin === self.location.origin && url.pathname.startsWith(new URL('./', self.location).pathname);
  if (!ours && !OTHER_HOSTS.includes(url.hostname)) return;

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const key = req.mode === 'navigate' ? new URL('./', self.location).href : req;
      const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        e.waitUntil(fresh.then(() => {}, () => {}));
        return cached;
      }
      return fresh.then((res) => res || Response.error());
    })
  );
});
