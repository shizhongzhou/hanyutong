/* 汉语熊猫 offline cache — only this app's scope and its own cache prefix. */
const PREFIX = "hanyu-panda-";
const CACHE = PREFIX + "v8";
const CORE = ["./", "index.html", "css/app.css?v=8", "css/study.css?v=8", "css/translate.css?v=8", "js/translate.js?v=8", "js/wordwall.js?v=8", "js/study.js?v=8", "data/hsk3/legacy-bridge.json", "js/content.js?v=8", "js/app.js?v=8", "js/hsk3.js?v=8", "data/hsk3/manifest.json", "data/hsk3/exams.json", "data/hsk3/vocabulary-1-01.json", "js/dictionary.js?v=8", "js/scenarios.js?v=8", "vendor/fflate.min.js?v=8", "js/library.js?v=8", "data/library-catalog.json", "vendor/pdfjs/legacy/build/pdf.min.mjs", "vendor/pdfjs/legacy/build/pdf.worker.min.mjs", "manifest.webmanifest", "vendor/hanzi-writer.min.js",
  "icons/panda-180.png", "icons/panda-192.png", "icons/panda-512.png",
  "data/hsk1.json", "data/hsk2.json", "data/hsk3.json", "data/hsk4.json", "data/hsk5.json", "data/hsk6.json"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const own = url.href.startsWith(self.registration.scope);
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!own && !fonts) return;
  // Versioned dictionary shards are immutable and cached only after use.
  if (own && url.pathname.includes("/data/dictionary/") && url.pathname.endsWith(".gz")) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const cached = await c.match(req); if (cached) return cached;
      const response = await fetch(req);
      if (response.ok) { try { await c.put(req, response.clone()); } catch (_) {} }
      return response;
    }));
    return;
  }
  // network first for our files (fresh updates), cache fallback offline
  e.respondWith(fetch(req).then(res => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: !fonts }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
