/* Logout total: bersihkan semua jejak app di perangkat ini (storage, cache, service worker),
   lalu muat ulang dari nol. Dipakai supaya tidak ada sisa data/aset versi lama yang nyangkut —
   terutama di HP yang app-nya di-install sebagai PWA.

   Catatan: app ini tidak punya token/sesi (login = pilih nama + password, `me` cuma state React),
   jadi yang perlu dibersihkan memang cuma penyimpanan lokal + cache + SW. */
export async function comprehensiveLogout() {
  // Cabut langganan push dulu selagi SW masih hidup — kalau tidak, perangkat ini tetap
  // kebagian notifikasi walau sudah logout.
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) {
        try { if (window.storage && window.storage.deletePushSub) await window.storage.deletePushSub(sub.endpoint); } catch (e) {}
        try { await sub.unsubscribe(); } catch (e) {}
      }
    }
  } catch (e) {}

  // Preferensi pribadi (tema, suara) ikut kebuang — ini memang logout "bersih total",
  // dan default-nya sama dengan tampilan awal app.
  try { localStorage.clear(); } catch (e) {}
  try { sessionStorage.clear(); } catch (e) {}

  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {}

  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => {})));
    }
  } catch (e) {}

  // App tidak punya route /login — layar login otomatis muncul saat belum ada user terpilih.
  window.location.replace("/");
}

export default comprehensiveLogout;
