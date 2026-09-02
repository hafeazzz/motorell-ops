import { useEffect } from "react";
import { registerSW, swSupported } from "../utils/sw";

const CHECK_MS = 30000; // cek update tiap 30 detik

// Daftarkan service worker & tarik versi baru ke belakang layar secara berkala.
//
// SENGAJA TIDAK reload di sini. Dulu hook ini reload begitu 'controllerchange' nyala
// (SW baru mengambil alih halaman). Di macOS desktop itu jadi "refresh sendiri pas buka
// menu": tiap balik ke jendela browser → visibilitychange → reg.update() → kalau browser
// menganggap sw.js "baru" (revalidasi skrip SW di Safari longgar; edge Vercel kadang jawab
// 200 bukan 304) → skipWaiting + clients.claim → controllerchange → reload, padahal bukan
// deploy baru. HP membekukan tab background jadi jarang kena; Windows biasanya 1 jendela
// fokus jadi jarang kena; macOS (banyak Cmd-Tab) kena terus.
//
// Satu-satunya sinyal "ada deploy baru" yang dipakai sekarang: useVersionCheck membandingkan
// BUILD_ID (ditempel di bundle) dengan /version.json, lalu safeReload() (tunda sampai tab
// disembunyikan). Hook ini cukup memastikan SW + cache versi baru sudah ke-fetch & siap.
export default function useServiceWorker() {
  useEffect(() => {
    if (!swSupported()) return;
    let dead = false;
    let timer = null;

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
    };
  }, []);
}
