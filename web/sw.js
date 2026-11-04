/* 汉语熊猫 offline cache — only this app's scope and its own cache prefix. */
const PREFIX = "hanyu-panda-";
const CACHE = PREFIX + "v1";
const CORE = ["./", "index.html", "css/app.css?v=1", "js/content.js?v=1", "js/app.js?v=1", "manifest.webmanifest",
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
  // network first for our files (fresh updates), cache fallback offline
  e.respondWith(fetch(req).then(res => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: !fonts }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
