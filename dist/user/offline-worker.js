const SHELL = [
  '/',
  '/app.js',
  '/checkin-model.js',
  '/checkins.css',
  '/checkins.js',
  '/framing.js',
  '/header.css',
  '/map-and-drafts.css',
  '/navigation-view.css',
  '/outings.js',
  '/page-layout.css',
  '/pages/account.js',
  '/pages/points.js',
  '/pages/shell.js',
  '/photography.js',
  '/point-views.js',
  '/search.css',
  '/search.js',
  '/settings.css',
  '/settings.js',
  '/shared/alternative-location.js',
  '/shared/alternative-sdk.js',
  '/shared/auth-routing.js',
  '/shared/avatar-crop.js',
  '/shared/avatar-presets.js',
  '/shared/base.css',
  '/shared/campus-model.css',
  '/shared/campus-panorama.css',
  '/shared/coordinates.js',
  '/shared/display-preferences.js',
  '/shared/drafts.js',
  '/shared/features.js',
  '/shared/fresh-location.js',
  '/shared/liquid.css',
  '/shared/map-apps.css',
  '/shared/passport.css',
  '/shared/photography.css',
  '/shared/point-reactions.css',
  '/shared/point-reactions.js',
  '/shared/polish.css',
  '/shared/preferences.js',
  '/shared/profile.css',
  '/shared/profile.js',
  '/shared/public-offline.js',
  '/shared/shooting-community.css',
  '/shared/shooting-conditions.js',
  '/shared/site-content.js',
  '/shared/tencent-location.js',
  '/shared/tencent-map.css',
  '/shared/ui.js',
  '/shooting.js',
  '/startup.css',
  '/startup.js',
  '/style.css',
  '/theme.css',
  '/visual.css',
];
// Only public program files. API, private photos, login, admin and external URLs never enter CacheStorage.
const CACHE = 'campus-shell-7.0.0-final';
const allowed = (url) =>
  url.origin === self.location.origin &&
  (url.pathname === '/' || /\.(?:js|css)$/.test(url.pathname)) &&
  !/^\/(?:admin|api|media)\//.test(url.pathname);
self.addEventListener('install', (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        (async () => {
          for (const url of SHELL) {
            const response = await fetch(url, { cache: 'no-cache', priority: 'low' });
            if (!response.ok) throw Error('Offline shell incomplete');
            await c.put(url, response);
          }
        })(),
      )
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('campus-shell-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !allowed(new URL(e.request.url))) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((res) => res || Response.error())),
  );
});
