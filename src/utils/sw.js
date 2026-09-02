/* Satu sumber kebenaran untuk URL service worker.
   Build id ditempel sebagai query (?v=) supaya tiap deploy baru dianggap SW baru oleh browser —
   tanpa ini, isi sw.js yang sama persis bikin browser mengira tidak ada update. */
export const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
export const SW_URL = `/sw.js?v=${BUILD_ID}`;

export const swSupported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;

// Selalu daftar lewat fungsi ini (jangan register("/sw.js") langsung) biar semua pemanggil
// memakai URL ber-versi yang sama — kalau beda URL, browser bikin registrasi ganda.
export function registerSW() {
  if (!swSupported()) return Promise.resolve(null);
  return navigator.serviceWorker.register(SW_URL);
}

/* ===== Reload aman untuk auto-update =====
   Dua hal yang bikin user (terutama di macOS desktop, tab dibiarkan kebuka lama) kena
   "refresh sendiri" pas lagi diam:
   1. reload dijalankan saat halaman lagi dilihat → scroll & konteks user hilang mendadak.
   2. reload-loop: mis. index.html basi di edge cache tak kunjung cocok dengan /version.json,
      atau dua registrasi SW saling rebut kontrol → controllerchange nyala terus.
   safeReload() menahan reload sampai tab disembunyikan (jadi versi baru kepasang diam-diam,
   user balik-balik sudah fresh) dan punya pemutus arus kalau reload kelewat sering. */
const RELOAD_LOG_KEY = "motorell-reload-log";
const RELOAD_MAX = 3;
const RELOAD_WINDOW_MS = 60 * 1000;

function reloadLoopTripped() {
  const now = Date.now();
  let log = [];
  try { log = JSON.parse(localStorage.getItem(RELOAD_LOG_KEY) || "[]"); } catch (e) {}
  log = (Array.isArray(log) ? log : []).filter((t) => typeof t === "number" && now - t < RELOAD_WINDOW_MS);
  if (log.length >= RELOAD_MAX) {
    try { console.warn("[motorell] auto-reload dimatikan sementara: reload terlalu sering, kemungkinan loop"); } catch (e) {}
    return true;
  }
  log.push(now);
  try { localStorage.setItem(RELOAD_LOG_KEY, JSON.stringify(log)); } catch (e) {}
  return false;
}

let reloadArmed = false;
export function safeReload() {
  if (reloadArmed) return;
  if (reloadLoopTripped()) return;
  reloadArmed = true;

  const go = () => { try { window.location.reload(); } catch (e) {} };
  if (typeof document === "undefined" || document.visibilityState === "hidden") { go(); return; }

  const onHide = () => {
    if (document.visibilityState === "hidden") {
      document.removeEventListener("visibilitychange", onHide);
      go();
    }
  };
  document.addEventListener("visibilitychange", onHide);
}
