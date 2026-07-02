/* Motorell Ops — Service Worker (Web Push)
   Menampilkan notifikasi walau app/tab tertutup total. */

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { try { data = { title: "Motorell", body: event.data ? event.data.text() : "" }; } catch (e2) { data = {}; } }
  event.waitUntil((async () => {
    // Kalau app lagi kebuka & aktif di layar, biarkan notif in-app yang urus (cegah dobel)
    try {
      const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = clientsArr.some((c) => c.visibilityState === "visible" || c.focused);
      if (visible) return;
    } catch (e) {}
    const title = data.title || "Motorell";
    const options = {
      body: data.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      tag: data.tag || undefined,
      renotify: true,
      data: { url: data.url || "/" },
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clientsArr) { if ("focus" in c) { try { await c.focus(); return; } catch (e) {} } }
    if (self.clients.openWindow) { try { await self.clients.openWindow(url); } catch (e) {} }
  })());
});