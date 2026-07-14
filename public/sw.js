/* Motorell Ops — Service Worker (Web Push + auto-refresh saat ada deploy baru)
   Menampilkan notifikasi walau app/tab tertutup total. */

// Versi diambil dari query ?v= saat registrasi (di-stamp build id). Tiap deploy baru =
// URL SW berubah = browser meng-install ulang SW ini = cache lama dibuang & app reload.
const VERSION = (() => {
  try { return new URL(self.location.href).searchParams.get("v") || "dev"; } catch (e) { return "dev"; }
})();
const CACHE = `motorell-${VERSION}`;

self.addEventListener("install", (e) => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // buang cache milik versi lama biar tidak ada aset basi yang nyangkut
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    } catch (err) {}
    try { await self.clients.claim(); } catch (err) {}
  })());
});

/* Network-first: selalu coba jaringan dulu supaya selalu dapat versi terbaru; cache cuma
   jaring pengaman kalau lagi offline. Hanya GET & same-origin — request ke Supabase/CDN
   dibiarkan lewat apa adanya, dan /version.json sengaja tidak pernah di-cache. */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/version.json" || url.pathname === "/sw.js") return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) { try { const c = await caches.open(CACHE); await c.put(req, fresh.clone()); } catch (e) {} }
      return fresh;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === "navigate") { const shell = await caches.match("/"); if (shell) return shell; }
      throw err;
    }
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { try { data = { title: "Motorell", body: event.data ? event.data.text() : "" }; } catch (e2) { data = {}; } }
  event.waitUntil((async () => {
    // Kalau app lagi kebuka & aktif di layar, biarkan notif in-app yang urus (cegah dobel)
    try {
      const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = clientsArr.some((c) => c.visibilityState === "visible" || c.focused);
      if (visible && !data.force) return;
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
