const SHELL = "shell-v2";
const IMG = "img-v1";
const DATA = "data-v1";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png",
  "fonts/onest-cyrillic-wght-normal.woff2", "fonts/onest-latin-wght-normal.woff2",
  "fonts/unbounded-cyrillic-wght-normal.woff2", "fonts/unbounded-latin-wght-normal.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => ![SHELL, IMG, DATA].includes(k)).map((k) => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // лента: сначала сеть, без сети - сохранённая
  if (url.pathname.endsWith("/data/news.json")) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(DATA).then((c) => c.put("news", copy));
        return r;
      }).catch(() => caches.open(DATA).then((c) => c.match("news")))
    );
    return;
  }

  // картинки из Telegram: кэшируем, чтобы открывались офлайн
  if (req.destination === "image" && url.origin !== location.origin) {
    e.respondWith(
      caches.open(IMG).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const r = await fetch(req, { mode: "no-cors" });
          c.put(req, r.clone());
          trimImages(c);
          return r;
        } catch { return Response.error(); }
      })
    );
    return;
  }

  // само приложение: с интернетом берём свежее, без интернета - из кэша
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
        return r;
      }).catch(() => caches.open(SHELL).then((c) => c.match(req, { ignoreSearch: true })))
    );
  }
});

async function trimImages(c) {
  const keys = await c.keys();
  if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) c.delete(k);
}
