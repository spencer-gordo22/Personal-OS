/* ============================================================
   Spencer OS — Service Worker
   Cache strategy:
     • Static assets  → cache-first (versioned by CACHE_NAME)
     • /api/*         → network-only  (live data)
     • Everything else → network-first, fall back to cache
   ============================================================ */

const CACHE_NAME   = 'spencer-os-v35';
const STATIC_URLS  = [
  '/',
  '/index.html',
  '/manifest.json',
  '/colors_and_type.css?v=35',
  '/db.js?v=35',
  '/ui.jsx?v=35',
  '/Sidebar.jsx?v=35',
  '/TopBar.jsx?v=35',
  '/App.jsx?v=35',
  '/modules/Cash.jsx?v=35',
  '/modules/Investments.jsx?v=35',
  '/modules/HealthPulse.jsx?v=35',
  '/modules/Workouts.jsx?v=35',
  '/modules/DailyChecklist.jsx?v=35',
  '/modules/CRM.jsx?v=35',
  '/modules/Calendar.jsx?v=35',
  '/modules/Journal.jsx?v=35',
  '/modules/Goals.jsx?v=35',
  '/modules/SAT.jsx?v=35',
  '/modules/CommandPalette.jsx?v=35',
  '/assets/logo-mark.svg',
  '/assets/logo-wordmark.svg',
];

/* ── install: precache static assets ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_URLS).catch(err => {
        /* Non-fatal: some versioned URLs may 404 on first deploy */
        console.warn('[SW] Precache partial failure (ok to ignore):', err);
      })
    )
  );
  self.skipWaiting();
});

/* ── activate: drop old caches ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── fetch: routing strategy ── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  /* Skip non-GET and cross-origin (CDN scripts, Google APIs, Supabase) */
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  /* API routes → always network, never cache */
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/whoop/') ||
      url.pathname.startsWith('/telegram/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  /* Static versioned assets (contain ?v=) → cache-first */
  if (url.search.includes('v=') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  /* Everything else (index.html, manifest) → network-first, cache fallback */
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});

/* ── push: show notification ── */
self.addEventListener('push', (event) => {
  let data = { title: 'Spencer OS', body: '', url: '/' };
  try {
    if (event.data) data = { ...data, ...JSON.parse(event.data.text()) };
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:     data.body,
      icon:     '/assets/logo-mark.svg',
      badge:    '/assets/logo-mark.svg',
      tag:      'spencer-os-push',
      renotify: true,
      data:     { url: data.url },
    })
  );
});

/* ── notificationclick: focus or open the app ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(target);
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
