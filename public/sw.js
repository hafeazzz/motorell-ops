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
      // Getar di HP. Catatan: SW TIDAK bisa memainkan audio sendiri (tidak ada AudioContext di
      // service worker, dan opsi `sound` sudah tidak didukung browser) — bunyi yang terdengar
      // adalah nada notifikasi bawaan OS. Nada WebAudio cuma bisa main saat app-nya kebuka.
      vibrate: data.vibrate || [200, 100, 200],
      data: { url: data.url || "/" },
    };
    await self.registration.showNotification(title, options);
  })());
});

/* ===== Ganti-subscription otomatis =====
   Browser sesekali MEROTASI push subscription sendiri di belakang layar (bikin endpoint baru,
   yang lama jadi mati) — ini penyebab utama sebagian device (macOS Safari terutama) berhenti
   dapat notif seiring waktu, karena app cuma pernah menyimpan endpoint sekali waktu login.
   Di sini SW menyimpan sendiri siapa pemilik device ini (dikirim App.jsx lewat postMessage,
   disimpan ke Cache Storage biar tetap ada walau SW-nya di-restart browser), supaya saat
   `pushsubscriptionchange` terjadi, SW bisa langsung re-subscribe & simpan ulang ke Supabase
   TANPA perlu tab app-nya kebuka. */
const SUPABASE_URL = "https://txmrcgvcfgfulwelideb.supabase.co";
const SUPABASE_KEY = "sb_publishable_csR5fqVv0BDZEr8R1ZXQfg_4WBG5QYH";
const VAPID_PUBLIC = "BDdyxYQ6Y8hVX0ZdrMZk4P6fgqH0n6FfT501RNJjvJxdMPRoZqNjkkO1ZHkHn2aFpwICxAunybpNZ8-gI5e0m0c";
const META_CACHE = "motorell-meta";
const META_REQ = "https://motorell.local/__push-user"; // kunci palsu, Cache API butuh Request-like

function urlB64ToUint8(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function getSavedUserId() {
  try { const c = await caches.open(META_CACHE); const r = await c.match(META_REQ); return r ? (await r.json()).userId || null : null; } catch (e) { return null; }
}
async function saveUserId(userId) {
  try { const c = await caches.open(META_CACHE); await c.put(META_REQ, new Response(JSON.stringify({ userId }))); } catch (e) {}
}

self.addEventListener("message", (event) => {
  const d = event.data;
  if (d && d.type === "MR_SET_USER" && d.userId) event.waitUntil(saveUserId(d.userId));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const userId = await getSavedUserId();
      if (!userId) return; // tidak tahu device ini punya siapa — tidak ada yang bisa disimpan
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
      const newSub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) });
      const body = newSub.toJSON();
      await fetch(`${SUPABASE_URL}/rest/v1/push_subs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ endpoint: body.endpoint, user_id: userId, sub: body, updated: Date.now() }),
      });
      if (oldEndpoint && oldEndpoint !== body.endpoint) {
        await fetch(`${SUPABASE_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(oldEndpoint)}`, { method: "DELETE", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      }
    } catch (e) { console.error("pushsubscriptionchange error:", e); }
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
