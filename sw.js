// Screentimer Service Worker: immer zuerst frisch aus dem Netz, bei Funkloch aus dem Cache.
// So kommen Updates automatisch an, und die App öffnet sich trotzdem offline.
const CACHE = 'screentimer-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Supabase-Daten nie cachen
  if (url.hostname.endsWith('supabase.co')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (url.origin === location.origin || /unpkg|jsdelivr|fonts\.g/.test(url.hostname))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
