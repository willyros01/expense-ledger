// v2 — switched from cache-first to network-first for the app shell.
// Cache-first was masking every update: as long as this file's own bytes
// didn't change, the browser never re-ran "install", so index.html stayed
// stuck on whatever was cached the very first time the app was added to
// the home screen. Network-first means you always get the latest version
// when you have a connection, and only fall back to the cache if you're
// genuinely offline.
const CACHE_NAME = "expense-ledger-v6";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
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
  const url = new URL(event.request.url);
  const isShellFile = SHELL_FILES.some((f) => url.pathname.endsWith(f.replace("./", "")));
  if (event.request.method !== "GET" || !isShellFile) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
