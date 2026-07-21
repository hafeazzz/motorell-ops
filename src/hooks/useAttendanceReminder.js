import { useEffect, useRef } from "react";

/* Pengingat absen (jam WIB):
   - "absen_masuk": H-15 sebelum jam masuk (default 09:00 → alarm 08:45).
   - "absen_pulang": tepat jam pulang (default 18:00).
   Sama polanya dengan useBreakReminder — in-app only, hormati toggle suara, dan pakai jendela
   "kejar ketinggalan" karena browser men-throttle timer di tab yang di-background. */
const JAM_MASUK = { h: 9, m: 0 };
const JAM_PULANG = { h: 18, m: 0 };
const REMINDER_BEFORE_MIN = 15;

const masukTarget = JAM_MASUK.h * 60 + JAM_MASUK.m - REMINDER_BEFORE_MIN;
const pulangTarget = JAM_PULANG.h * 60 + JAM_PULANG.m;

const ALARMS = [
  { key: "absen_masuk", target: masukTarget, title: "Jangan lupa absen!", body: `Absen masuk sebelum jam ${String(JAM_MASUK.h).padStart(2, "0")}.${String(JAM_MASUK.m).padStart(2, "0")} ya.` },
  { key: "absen_pulang", target: pulangTarget, title: "Waktunya pulang", body: "Jangan lupa absen keluar sebelum pulang ya." },
];
const CATCHUP_MIN = 45;

// Reminder LIBUR tiap hari SENIN (WIB): aktif Selasa–Minggu, Senin di-skip total.
// Weekday dihitung di zona Asia/Jakarta biar konsisten walau timezone perangkat beda.
function isReminderActiveDay() {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", weekday: "short" }).format(new Date()) !== "Mon";
  } catch (e) {
    return new Date().getDay() !== 1; // fallback: hari lokal (0=Minggu, 1=Senin)
  }
}

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

function playAlarm(kind) {
  try {
    if (localStorage.getItem("motorell-sound") === "0") return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    if (ac.state === "suspended") ac.resume();
    // masuk = dua nada pendek naik (mengingatkan/waspada), pulang = satu nada turun panjang (santai)
    const notes = kind === "absen_masuk" ? [880, 880] : [659.25, 440];
    notes.forEach((f, i) => {
      const t = ac.currentTime + i * 0.22;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + 0.32);
    });
    setTimeout(() => { try { ac.close(); } catch (e) {} }, 1400);
  } catch (e) {}
}

/* enabled: false untuk owner (owner tidak absen). skip: { absen_masuk, absen_pulang } — true
   kalau item itu sudah tidak perlu diingatkan lagi (sudah absen masuk / sudah absen keluar). */
export default function useAttendanceReminder(enabled, skip, onAlarm) {
  const cb = useRef(onAlarm); cb.current = onAlarm;
  const skipRef = useRef(skip); skipRef.current = skip;

  useEffect(() => {
    if (!enabled) return;
    const fire = (a) => {
      playAlarm(a.key);
      try { if (navigator.vibrate) navigator.vibrate([160, 90, 160]); } catch (e) {}
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(a.title, { body: a.body, icon: "/icon.png", badge: "/icon.png", tag: a.key, renotify: true });
        }
      } catch (e) {}
      if (cb.current) cb.current({ kind: a.key, title: a.title, body: a.body });
    };

    const tick = () => {
      if (!isReminderActiveDay()) return; // Senin: reminder libur, tidak trigger apa pun
      const { date, mins } = wibNow();
      for (const a of ALARMS) {
        if (mins < a.target || mins > a.target + CATCHUP_MIN) continue;
        if (skipRef.current && skipRef.current[a.key]) continue; // sudah absen — tidak perlu diingatkan lagi
        const fired = `motorell-alarm-${a.key}-${date}`;
        try {
          if (localStorage.getItem(fired)) continue;
          localStorage.setItem(fired, "1");
        } catch (e) {}
        fire(a);
      }
    };

    tick();
    const timer = setInterval(tick, 30000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);

    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled]);
}
