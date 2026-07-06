const CACHE_NAME = "cuaderno-nutricional-v1";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./styles.css",
    "./script.js",
    "./manifest.webmanifest",

    "./img/logo.svg",
    "./img/icon-192.png",
    "./img/icon-512.png",

    "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js",
    "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(FILES_TO_CACHE))
    );

    self.skipWaiting();
});

self.addEventListener("activate", event => {

    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME)
                        return caches.delete(key);
                })
            )
        )
    );

    self.clients.claim();
});

self.addEventListener("fetch", event => {

    event.respondWith(

        caches.match(event.request).then(response => {

            if (response)
                return response;

            return fetch(event.request)
                .then(networkResponse => {

                    if (
                        event.request.method === "GET" &&
                        event.request.url.startsWith("http")
                    ) {

                        const copy = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, copy));

                    }

                    return networkResponse;

                }).catch(() => caches.match("./index.html"));

        })

    );

});