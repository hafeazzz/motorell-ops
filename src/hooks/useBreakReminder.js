import { useEffect, useRef } from "react";

/* Alarm istirahat (jam WIB): mulai 12:00, selesai 13:30.
   Bunyi + notifikasi browser + getar (HP) + toast in-app.

   Catatan penting: ini alarm IN-APP — cuma nyala kalau app-nya lagi kebuka (tab/PWA).
   Kalau app tertutup total, satu-satunya cara adalah web push dari server (Edge Function
   `send-push` yang sudah ada) — itu di luar cakupan hook ini. */
const ALARMS = [
  { key: "break_start", h: 12, m: 0, title: "Waktunya istirahat", body: "Istirahat sampai 13:30. Selamat makan!" },
  { key: "break_end", h: 13, m: 30, title: "Istirahat selesai", body: "Yuk balik kerja lagi 💪" },
];
// Toleransi "kejar ketinggalan": browser men-throttle setInterval di tab yang lagi di-background
// (minimize, pindah tab lain) — kadang sampai berhenti sama sekali selama beberapa menit — jadi
// jendela deteksinya sengaja dilebarkan, bukan cuma beberapa detik pas-pasan, supaya tab yang
// baru "sadar" lagi (visibilitychange ke visible) masih menganggap alarm hari itu berlaku.
const CATCHUP_MIN = 45;

// Jam WIB (Asia/Jakarta) — dihitung sendiri di sini biar hook ini tidak perlu impor dari
// App.jsx (App.jsx yang impor hook ini; impor balik = circular import).
function wibNow() {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t).value;
    return { date: `${g("year")}-${g("month")}-${g("day")}`, mins: (+g("hour") % 24) * 60 + +g("minute") };
  } catch (e) {
    const d = new Date();
    return { date: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, mins: d.getHours() * 60 + d.getMinutes() };
  }
}

// Nada alarm dibangkitkan pakai WebAudio (pola yang sama dengan playClick) — tidak pakai file
// mp3 supaya tidak ada aset biner yang harus di-hosting & di-cache.
function playAlarm(kind) {
  try {
    if (localStorage.getItem("motorell-sound") === "0") return; // hormati toggle suara di Profil
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    if (ac.state === "suspended") ac.resume();
    const notes = kind === "break_start" ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25]; // naik = istirahat, turun = balik kerja
    notes.forEach((f, i) => {
      const t = ac.currentTime + i * 0.18;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + 0.36);
    });
    setTimeout(() => { try { ac.close(); } catch (e) {} }, 1600);
  } catch (e) {}
}

export default function useBreakReminder(onAlarm) {
  const cb = useRef(onAlarm);
  cb.current = onAlarm;

  useEffect(() => {
    const fire = (a) => {
      playAlarm(a.key);
      try { if (navigator.vibrate) navigator.vibrate(a.key === "break_start" ? [200, 100, 200] : [120, 80, 120, 80, 240]); } catch (e) {}
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(a.title, { body: a.body, icon: "/icon.png", badge: "/icon.png", tag: a.key, renotify: true });
        }
      } catch (e) {}
      if (cb.current) cb.current({ kind: a.key, title: a.title, body: a.body });
    };

    const tick = () => {
      const { date, mins } = wibNow();
      for (const a of ALARMS) {
        const target = a.h * 60 + a.m;
        if (mins < target || mins > target + CATCHUP_MIN) continue;
        const fired = `motorell-alarm-${a.key}-${date}`; // sekali sehari per alarm, per perangkat
        try {
          if (localStorage.getItem(fired)) continue;
          localStorage.setItem(fired, "1");
        } catch (e) {}
        fire(a);
      }
    };

    // Pemicu manual (buat tes / kalau nanti mau dipanggil dari mana pun):
    //   window.dispatchEvent(new CustomEvent("mr-alarm", { detail: { kind: "break_start" } }))
    // Pola CustomEvent yang sama dipakai FunFX ("mr-sale", "mr-catrun").
    const onManual = (e) => {
      const kind = (e && e.detail && e.detail.kind) || "break_start";
      const a = ALARMS.find((x) => x.key === kind);
      if (a) fire(a);
    };
    window.addEventListener("mr-alarm", onManual);

    tick();
    const timer = setInterval(tick, 30000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); }; // HP habis di-background
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(timer);
      window.removeEventListener("mr-alarm", onManual);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
}
