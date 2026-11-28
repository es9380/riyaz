/* Riyaz Service Worker — versioned cache, immediate takeover,
   network-first HTML shell, cache-first static assets. */

const SITE_VERSION = "3.19.0";
const CACHE_NAME = `riyaz-v${SITE_VERSION}`;

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
  "./core/sound.js",
  "./core/stats.js",
  "./core/scoring.js",
  "./core/engine.js",
  "./data/counts.js",
  "./data/examSpecs.js",
  "./data/exams.js",
  "./data/passages.js",
  "./data/drills.js",
  "./data/warmups.js",
  "./features/home.js",
  "./features/home-anim.js",
  "./features/arena.js",
  "./features/studio.js",
  "./features/progress.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        SHELL_ASSETS.map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => (res && res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isMainPage =
    req.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith("/index.html");

  if (isMainPage) {
    /* Main page: network-first (always freshest online, cache fallback offline) */
    event.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.open(CACHE_NAME).then((cache) =>
            cache.match(req).then((hit) => hit || cache.match("./index.html"))
          )
        )
    );
    return;
  }

  /* Static assets: cache-first under the versioned cache */
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        });
      })
    )
  );
});
