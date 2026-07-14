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
