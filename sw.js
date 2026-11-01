// Offline support. Network first so updates show up straight away; the cache is used only when offline.
// Bump VERSION when the file list changes.
const VERSION = "speakwise-v5";
const SHELL = ["./", "index.html", "dashboard.html", "css/app.css", "css/tokens.css", "css/base.css", "manifest.webmanifest", "topics.json",
  "js/app.js", "js/scoring.js", "js/topics.js", "js/store.js", "js/media.js", "js/wave.js", "js/coach.js", "js/resume.js", "js/dashboard.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_vercel/")) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
