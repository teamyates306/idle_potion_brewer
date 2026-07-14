/* Idle Potion Brewer — offline asset service worker.
 *
 * The workshop art (sprites), the pixel font and the built app bundle are all
 * fetched over the network at render time, so going offline used to strip most
 * of the game's SVGs. This worker:
 *   - precaches every sprite + the app shell on install,
 *   - serves static assets cache-first (with background refresh),
 *   - caches the Google-Fonts CSS/woff2 after the first online visit,
 *   - falls back to the cached shell for navigations while offline.
 */
const CACHE = "ipb-static-v1";

const PRECACHE = [
  "/",
  "/potion.svg",
  "/sprites/bone.svg",
  "/sprites/crystal.svg",
  "/sprites/essence.svg",
  "/sprites/floor-tile.svg",
  "/sprites/fungus.svg",
  "/sprites/lamp.svg",
  "/sprites/machine.svg",
  "/sprites/petal.svg",
  "/sprites/potion-bottle.svg",
  "/sprites/potion-brew.svg",
  "/sprites/potion-decoction.svg",
  "/sprites/potion-draught.svg",
  "/sprites/potion-elixir.svg",
  "/sprites/potion-philter.svg",
  "/sprites/root.svg",
  "/sprites/trough-160.svg",
  "/sprites/trough-240.svg",
  "/sprites/trough-320.svg",
  "/sprites/trough-400.svg",
  "/sprites/wall-tile.svg",
  "/sprites/worker.png",
  "/sprites/worker.json",
  "/sprites/worker-caravan.png",
  "/sprites/worker-caravan.json",
  "/sprites/worker-explorer.png",
  "/sprites/worker-explorer.json",
  "/sprites/worker-manic.png",
  "/sprites/worker-manic.json",
  "/sprites/worker-pounder.png",
  "/sprites/worker-pounder.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheableAsset(url) {
  if (url.origin === self.location.origin) {
    return (
      url.pathname.startsWith("/sprites/") ||
      url.pathname.startsWith("/assets/") || // hashed vite build output
      /\.(svg|png|jpg|webp|woff2?|css|js)$/.test(url.pathname)
    );
  }
  // Google Fonts (stylesheet + font files)
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Navigations: network first, cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  // Cache-first with background refresh.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
