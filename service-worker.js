const CACHE_VERSION = "cuaderno-nutricional-v20260708";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./firebase-config.js",
  "./firebase-sync.js",
  "./manifest.webmanifest",
  "./img/logo.svg",
  "./img/icon-192.png",
  "./img/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "./index.html"));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || cache.match(fallbackUrl);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}
