const CACHE_VERSION = "cuaderno-nutricional-v20260711g";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260711g",
  "./script.js?v=20260711g",
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

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request))
  );
});

