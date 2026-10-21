// Offline cache for the web app (e.g. on iPhone from the home screen).
// Network first so updates show up when online; cache as the fallback.
const CACHE = 'nazzamha-money-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The very first visit loads before this worker controls the page, so the
// page sends the list of files it already loaded (the right CanvasKit build
// for that browser, the fonts…) to be cached right away — offline then works
// from the first open.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        data.urls
          .filter((u) => /^https?:/.test(u))
          .map((u) =>
            cache.match(u).then((hit) => {
              if (hit) return;
              const sameOrigin = u.startsWith(self.location.origin);
              return fetch(u, sameOrigin ? {} : { mode: 'no-cors' })
                .then((res) => (res.ok || res.type === 'opaque' ? cache.put(u, res) : undefined))
                .catch(() => undefined);
            }),
          ),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache app files and fonts (fonts come from another origin, so may be opaque).
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: true })
          // Only page loads fall back to the app shell — never hand HTML to a script.
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
          // Nothing cached yet (first visit / mid-update): try the network once more.
          .then((hit) => hit || fetch(req)),
      ),
  );
});
