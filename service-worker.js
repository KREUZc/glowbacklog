const CACHE_NAME = "sparks-pwa-v1-thread";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./src/styles/app.css",
  "./src/app.js",
  "./src/core/actions.js",
  "./src/core/db.js",
  "./src/core/export.js",
  "./src/core/format.js",
  "./src/core/markdown.js",
  "./src/core/media.js",
  "./src/core/schema.js",
  "./src/core/storage.js",
  "./src/core/zip.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
  );
});
