// Service worker — basic offline support for the dashboard PWA
// Strategy:
//  - API calls (/api/*) and auth flows: pass through, never cache
//  - Navigation requests: network-first, fall back to last cached page or offline.html
//  - Static assets (script/style/image/font): stale-while-revalidate
//
// Bumping CACHE_VERSION invalidates all caches on next activate.

const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [OFFLINE_URL, "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never cache API or auth endpoints
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/signin")) return;

  // Navigation: network-first → fallback to cached page → offline.html
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) {
            const copy = fresh.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached || (await caches.match(OFFLINE_URL));
        }
      })()
    );
    return;
  }

  // Static assets: cache-first with background refresh
  const dest = request.destination;
  if (dest === "style" || dest === "script" || dest === "image" || dest === "font") {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const fetchAndUpdate = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => null);

        if (cached) return cached;
        const fresh = await fetchAndUpdate;
        return fresh || new Response("", { status: 504 });
      })()
    );
  }
});
