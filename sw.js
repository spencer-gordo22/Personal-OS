/* ============================================================
   Spencer OS — Service Worker
   Cache strategy:
     • Static assets  → cache-first (versioned by CACHE_NAME)
     • /api/*         → network-only  (live data)
     • Everything else → network-first, fall back to cache
   ============================================================ */

const CACHE_NAME   = 'spencer-os-v28';
const STATIC_URLS  = [
  '/',
  '/index.html',
  '/manifest.json',
  '/colors_and_type.css?v=27',
  '/db.js?v=27',
  '/ui.jsx?v=27',
  '/Sidebar.jsx?v=27',
  '/TopBar.jsx?v=27',
  '/App.jsx?v=27',
  '/modules/Cash.jsx?v=27',
  '/modules/Investments.jsx?v=27',
  '/modules/HealthPulse.jsx?v=27',
  '/modules/Workouts.jsx?v=27',
  '/modules/DailyChecklist.jsx?v=27',
  '/modules/CRM.jsx?v=27',
  '/modules/Calendar.jsx?v=27',
  '/modules/Journal.jsx?v=27',
  '/modules/Goals.jsx?v=27',
  '/modules/SAT.jsx?v=27',
  '/modules/CommandPalette.jsx?v=27',
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
