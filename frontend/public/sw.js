// Service worker: tekee pelistä asennettavan ja pitää sovelluksen rungon välimuistissa.
// - Sivu (index.html) haetaan aina ensin verkosta, jotta päivitykset näkyvät heti. Jos palvelin ei vastaa
//   muutamassa sekunnissa (esim. ilmainen palvelin herää unesta), näytetään välimuistissa oleva versio,
//   jolloin peli voi kertoa palvelimen heräämisestä tyhjän ruudun sijaan.
// - Hashatut tiedostot (/assets/) eivät koskaan muutu, joten ne tarjoillaan välimuistista.
// - API, socket.io ja muu liikenne kulkee suoraan verkkoon.
const CACHE = 'kpsl-v1';
const SHELL_KEY = '/';
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Poistetaan välimuistista vanhat JS- ja CSS-tiedostot, joihin uusin index.html ei enää viittaa
// (fontteihin ja kuviin viitataan CSS:stä, joten ne jätetään rauhaan)
async function pruneAssets(cache, html) {
  const used = new Set([...html.matchAll(/\/assets\/[^"')\s]+/g)].map(m => m[0]));
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (/^\/assets\/.*\.(js|css)$/.test(path) && !used.has(path)) await cache.delete(request);
  }
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(SHELL_KEY, response.clone());
      response.clone().text().then(html => pruneAssets(cache, html)).catch(() => {});
    }
    return response;
  });
  const cached = await cache.match(SHELL_KEY);
  if (!cached) return network;
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  try {
    return (await Promise.race([network, timeout])) ?? cached;
  } catch {
    return cached;
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleAsset(request));
  }
});

// Push-ilmoitus palvelimelta: { title, body, url, tag }
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* virheellinen sisältö */ }
  event.waitUntil(self.registration.showNotification(data.title || 'BOWL', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' },
  }));
});

// Ilmoituksen napautus: avataan peli oikeaan näkymään (käytetään jo auki olevaa ikkunaa, jos sellainen on)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(w => new URL(w.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      return existing.navigate(url);
    }
    return self.clients.openWindow(url);
  })());
});
