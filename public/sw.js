// Service worker: notificaciones push y copia de la app del personal para abrirla sin cobertura
const PAGES = "artigot-paginas-v1";
const STATIC = "artigot-estaticos-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("artigot-") && ![PAGES, STATIC].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

// Al cerrar sesión se borra la copia de las páginas
self.addEventListener("message", (e) => {
  if (e.data === "logout") e.waitUntil(caches.delete(PAGES));
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Archivos de la app (llevan huella en el nombre): primero la copia guardada
  if (url.pathname.startsWith("/_next/static/") || /^\/(logo\.png|icon-\d+\.png|apple-touch-icon\.png|manifest\.webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Páginas de la app del personal: primero la red y, si no hay cobertura, la última copia
  if (req.mode === "navigate" && (url.pathname === "/app" || url.pathname.startsWith("/app/"))) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        try {
          const res = await withTimeout(fetch(req), 8000);
          if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          const hit = (await cache.match(url.pathname)) || (await cache.match("/app"));
          if (hit) return hit;
          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:2rem;text-align:center"><h1>Sin conexión</h1><p>Abre la app una vez con cobertura para poder usarla después sin señal.</p><button onclick="location.reload()">Reintentar</button></body>',
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Artigot", body: event.data && event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Artigot", {
      body: data.body || "",
      tag: data.tag,
      renotify: !!data.tag,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === url && "focus" in c) return c.focus();
      }
      const any = list.find((c) => "navigate" in c);
      if (any) return any.navigate(url).then((c) => c && c.focus());
      return self.clients.openWindow(url);
    }),
  );
});
