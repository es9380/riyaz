/* Riyaz Service Worker — network-first for fresh code, cache fallback for offline practice. */

const CACHE_NAME = "riyaz-v3-offline-1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./icon.svg",
  "./manifest.json",
  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/stage.css",
  "./styles/pages.css",
  "./styles/riyaz-next.css",
  "./core/util.js",
  "./core/store.js",
  "./core/stats.js",
  "./core/scoring.js",
  "./core/engine.js",
  "./data/counts.js",
  "./data/examSpecs.js",
  "./features/home.js",
  "./features/arena.js",
  "./features/studio.js",
  "./features/progress.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
