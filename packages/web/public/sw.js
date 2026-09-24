// The app works offline. Built assets are content-hashed, so a cached copy is
// always the right one. The page and the API are fetched fresh when online,
// falling back to the last copy, so offline shows your last real data.
const CACHE = 'aura-shell-v2';
const FONTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Only keep real answers, never Cloudflare Access's login redirect.
const keep = (res) => (res.ok && !res.redirected) || res.type === 'opaque';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(['/manifest.webmanifest', '/icons/icon-192.png']);
    // Take the page and everything it links now, so the first visit is enough.
    const page = await fetch('/');
    if (!keep(page)) return;
    const html = await page.clone().text();
    await c.put('/', page);
    await c.addAll([...new Set(html.match(/\/assets\/[^"']+/g))]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (keep(res)) caches.open(CACHE).then((c) => c.put(request, res.clone()));
  return res;
}

async function networkFirst(request, key) {
  try {
    const res = await fetch(request);
    if (keep(res)) caches.open(CACHE).then((c) => c.put(key, res.clone()));
    return res;
  } catch (err) {
    const hit = await caches.match(key);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (FONTS.includes(url.hostname)) return event.respondWith(cacheFirst(request));
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) return event.respondWith(cacheFirst(request));
  // Keyed by path alone: date ranges in the query change on every load.
  if (url.pathname.startsWith('/api/')) return event.respondWith(networkFirst(request, url.pathname));
  if (request.mode === 'navigate') event.respondWith(networkFirst(request, '/'));
});
