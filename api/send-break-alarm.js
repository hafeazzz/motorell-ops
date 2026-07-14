/* Alarm istirahat versi SERVER (dipicu Vercel Cron, lihat vercel.json).

   Kenapa perlu: alarm in-app (src/hooks/useBreakReminder.js) cuma bunyi kalau app-nya lagi
   kebuka. Supaya tetap nongol walau app/HP tertutup, alarm dikirim sebagai Web Push.

   Pengirimannya menumpang Edge Function Supabase `send-push` yang SUDAH ada (VAPID private key
   sudah tersimpan di sana) — jadi kita tidak perlu menaruh salinan kunci rahasia kedua di Vercel
   maupun menambah dependency web-push. */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://txmrcgvcfgfulwelideb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_csR5fqVv0BDZEr8R1ZXQfg_4WBG5QYH";
const STATE_KEY = "motorell-state-v3";

const ALARMS = {
  break_start: { title: "Waktunya istirahat", body: "Istirahat sampai 13:30. Selamat makan!" },
  break_end: { title: "Istirahat selesai", body: "Yuk balik kerja lagi 💪" },
};

// Push di-target per user id, jadi ambil semua id dari state tim.
async function allUserIds() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/kv?key=eq.${STATE_KEY}&select=value`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`gagal baca state (${r.status})`);
  const rows = await r.json();
  const raw = rows && rows[0] && rows[0].value;
  const state = raw ? JSON.parse(raw) : null;
  return ((state && state.users) || []).map((u) => u.id).filter(Boolean);
}

async function invokePush(name, payload) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(payload),
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

export default async function handler(req, res) {
  // Vercel Cron menyertakan header ini kalau CRON_SECRET di-set di env project.
  // Tanpa secret, endpoint ini terbuka — set CRON_SECRET di Vercel biar tidak bisa dipicu orang lain.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const type = (req.query && req.query.type) || "break_start";
  const alarm = ALARMS[type];
  if (!alarm) return res.status(400).json({ ok: false, error: `type tidak dikenal: ${type}` });

  try {
    const toUserIds = await allUserIds();
    if (!toUserIds.length) return res.status(200).json({ ok: false, error: "tidak ada user di state" });

    // ?dry=1 → cuma laporkan sasaran, tidak benar-benar mengirim. Buat ngetes tanpa membangunkan satu tim.
    if (req.query && req.query.dry) {
      return res.status(200).json({ ok: true, dry: true, type, targets: toUserIds.length, title: alarm.title, body: alarm.body });
    }

    // force:false — kalau app-nya lagi kebuka & terlihat, sw.js sengaja diam dan alarm in-app yang
    // bunyi. Ini yang mencegah notifikasi dobel (push + timer) di perangkat yang app-nya aktif.
    const payload = { toUserIds, title: alarm.title, body: alarm.body, url: "/", force: false };

    let r = await invokePush("send-push", payload);
    if (!r.ok) r = await invokePush("send-psuh", payload); // nama lama yang typo — fallback, sama seperti di storage.js
    if (!r.ok) return res.status(502).json({ ok: false, type, status: r.status, error: r.body });

    return res.status(200).json({ ok: true, type, targets: toUserIds.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
