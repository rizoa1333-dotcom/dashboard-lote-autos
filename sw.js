/*
 * VeloDrive install helper. Requests always go to the server; this worker
 * intentionally does not cache the app shell, API responses, or customer data.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  // Network-only: no offline database or authentication data is stored here.
  event.respondWith(fetch(event.request));
});
