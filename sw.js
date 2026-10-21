// Offline support. The app's files are small, so they're all cached on
// install and served from the cache instantly; a newer version (new CACHE
// name) is fetched in the background and used from the next open.
const CACHE = 'nazzamha-web-v1';
const FONTS = 'nazzamha-fonts';
const APP = [
  './', 'index.html', 'app.css', 'app.js', 'store.js', 'icons.js', 'icons.otf', 'manifest.json',
  'favicon.png', 'icons/Icon-192.png', 'icons/apple-touch-icon.png', 'brand/wordmark.png',
];

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';

/** Saves the Arabic font too, so the very first offline open looks right. */
async function warmFonts() {
  try {
    const c = await caches.open(FONTS);
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    await c.put(FONT_CSS, res.clone());
    const urls = [...(await res.text()).matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all(urls.map((u) => fetch(u).then((r) => (r.ok ? c.put(u, r) : undefined)).catch(() => undefined)));
  } catch (_) { /* offline: the system Arabic font is used */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP)).then(() => warmFonts()).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The old Flutter version (for exporting old data) manages itself.
  if (url.pathname.includes('/old/')) return;

  // Google Fonts: cache first, they never change.
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then((c) => c.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      }))),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // App files: cache first (instant, offline), refreshed in the background.
  event.respondWith(
    caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) c.put(req, res.clone());
        return res;
      });
      if (hit) {
        event.waitUntil(net.catch(() => undefined));
        return hit;
      }
      return net.catch(() => (req.mode === 'navigate' ? c.match('index.html') : Response.error()));
    })),
  );
});
