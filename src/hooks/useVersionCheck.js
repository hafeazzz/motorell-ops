import { useEffect } from "react";
import { BUILD_ID, swSupported } from "../utils/sw";

const VERSION_KEY = "motorell-app-version";
const CHECK_MS = 5 * 60 * 1000; // 5 menit

// Bandingkan build yang sedang jalan di perangkat ini dengan build yang online (/version.json).
// Kalau beda = ada deploy baru → suruh SW ambil versi baru, lalu reload sekali.
export default function useVersionCheck() {
  useEffect(() => {
    if (BUILD_ID === "dev") return; // dev server: HMR yang urus, jangan reload-loop
    let dead = false;

    const check = async () => {
      try {
        const r = await fetch("/version.json", { cache: "no-store" });
        if (!r.ok || dead) return;
        const data = await r.json();
        const latest = data && data.version;
        if (dead || !latest) return;
        try { localStorage.setItem(VERSION_KEY, latest); } catch (e) {}
        if (latest === BUILD_ID) return;

        // Reload sekali saja per versi — kalau ada aset yang masih basi di edge cache,
        // jangan sampai halaman reload terus-terusan.
        const flag = "motorell-reloaded-" + latest;
        try { if (sessionStorage.getItem(flag)) return; sessionStorage.setItem(flag, "1"); } catch (e) {}

        if (swSupported()) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((reg) => reg.update().catch(() => {})));
          } catch (e) {}
        }
        window.location.reload();
      } catch (e) {} // offline / gagal fetch: diamkan, coba lagi nanti
    };

    check();
    const timer = setInterval(check, CHECK_MS);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis); // HP sering di-background: cek lagi pas dibuka

    return () => { dead = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, []);
}
