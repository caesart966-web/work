const SHELL = "shell-v1";
const IMG = "img-v1";
const DATA = "data-v1";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png"];

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

  // само приложение: сначала кэш, обновляем в фоне
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req, { ignoreSearch: true });
        const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      })
    );
  }
});

async function trimImages(c) {
  const keys = await c.keys();
  if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) c.delete(k);
}
