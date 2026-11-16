// Offline app shell. Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = "kitt-obd-v5";
const SHELL = ["./", "index.html", "style.css", "manifest.webmanifest", "js/app.js", "js/elm327.js",
  "js/gauge.js", "js/dtc.js", "js/demo.js", "data/dtc-db.json", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first (so updates arrive when online), cache fallback (works in a car with no signal).
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
