// Service worker: notificaciones push de la web app
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
