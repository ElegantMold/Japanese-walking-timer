const CACHE_NAME = "japanese-walking-timer-v11";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./service-worker.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./routine-guidance-compact.wav",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) =>
      cachedResponse || fetch(event.request)
    )
  );
});
