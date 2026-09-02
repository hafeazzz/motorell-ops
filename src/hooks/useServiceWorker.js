import { useEffect } from "react";
import { registerSW, swSupported, safeReload } from "../utils/sw";

const CHECK_MS = 30000; // cek update tiap 30 detik

// Daftarkan service worker, cek update berkala, dan reload otomatis begitu SW versi baru
// mengambil alih halaman (deploy baru langsung kepakai tanpa user harus refresh manual).
export default function useServiceWorker() {
  useEffect(() => {
    if (!swSupported()) return;
    let dead = false;
    let timer = null;
    let reloaded = false;

    // Kalau halaman ini belum dikontrol SW manapun (kunjungan pertama), 'controllerchange'
    // akan tetap nyala saat SW pertama aktif — itu bukan deploy baru, jadi jangan reload.
    const hadController = !!navigator.serviceWorker.controller;

    const onControllerChange = () => {
      if (dead || reloaded || !hadController) return;
      reloaded = true;
      safeReload(); // tunda sampai tab disembunyikan + pemutus arus anti-loop
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    (async () => {
      try {
        const reg = await registerSW();
        if (dead || !reg) return;
        timer = setInterval(() => { try { reg.update(); } catch (e) {} }, CHECK_MS);
      } catch (e) { console.error("registerSW error:", e); }
    })();

    return () => {
      dead = true;
      if (timer) clearInterval(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
}
