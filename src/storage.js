import { createClient } from "@supabase/supabase-js";

/* ============================================================
 * storage.js — versi SUPABASE + REALTIME (live auto-update)
 * Data tim (shared) disimpan ONLINE di Supabase.
 * Data pribadi (tema, suara) tetap di tiap HP (localStorage).
 * Realtime: perubahan dari HP lain langsung muncul tanpa refresh.
 * App.jsx hampir tidak diubah — cukup file ini + 1 blok kecil.
 * ============================================================ */

const SUPABASE_URL = "https://txmrcgvcfgfulwelideb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_csR5fqVv0BDZEr8R1ZXQfg_4WBG5QYH";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const TABLE = "kv";

/* localStorage: data pribadi + cadangan kalau offline */
const localGet = (key) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : { key, value: v };
  } catch (e) {
    return null;
  }
};
const localSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
  return { key, value };
};
const localDel = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
  return { key, deleted: true };
};

const storage = {
  async get(key, shared) {
    if (!shared) return localGet(key);
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data ? { key, value: data.value, shared: true } : null;
    } catch (e) {
      console.error("Supabase get error:", e);
      return localGet(key);
    }
  },

  async set(key, value, shared) {
    if (!shared) return localSet(key, value);
    try {
      const { error } = await supabase
        .from(TABLE)
        .upsert({ key, value }, { onConflict: "key" });
      if (error) throw error;
      localSet(key, value);
      return { key, value, shared: true };
    } catch (e) {
      console.error("Supabase set error:", e);
      return localSet(key, value);
    }
  },

  async delete(key, shared) {
    if (!shared) return localDel(key);
    try {
      const { error } = await supabase.from(TABLE).delete().eq("key", key);
      if (error) throw error;
      return { key, deleted: true };
    } catch (e) {
      console.error("Supabase delete error:", e);
      return localDel(key);
    }
  },

  async list(prefix = "", shared) {
    if (!shared) {
      try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
        return { keys, prefix };
      } catch (e) {
        return { keys: [], prefix };
      }
    }
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("key")
        .like("key", `${prefix}%`);
      if (error) throw error;
      return { keys: (data || []).map((r) => r.key), prefix };
    } catch (e) {
      console.error("Supabase list error:", e);
      return { keys: [], prefix };
    }
  },

  /* REALTIME: panggil callback tiap data 'key' ini berubah dari mana pun.
     Mengembalikan fungsi untuk berhenti mendengarkan (unsubscribe). */
  subscribe(key, callback) {
    let timer = null;
    const handler = () => {
      // debounce trailing: selalu reload SETELAH perubahan terakhir, jadi tidak ada update yang "tertelan"
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; callback(); }, 180);
    };
    const channel = supabase
      .channel(`kv-${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `key=eq.${key}` },
        handler
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    };
  },
};

/* ===== CHAT: tabel terpisah (append-only) supaya kirim barengan tidak saling timpa ===== */
const CHAT_TABLE = "chat";
storage.chatList = async () => {
  try {
    // ambil 300 pesan TERBARU, lalu balik urutannya jadi lama→baru untuk ditampilkan
    const { data, error } = await supabase.from(CHAT_TABLE).select("*").order("ts", { ascending: false }).limit(300);
    if (error) throw error;
    return (data || []).reverse();
  } catch (e) { console.error("chatList error:", e); return []; }
};
storage.chatSend = async (m) => {
  try { const { error } = await supabase.from(CHAT_TABLE).insert(m); if (error) throw error; return true; }
  catch (e) { console.error("chatSend error:", e); return false; }
};
storage.chatDelete = async (id) => {
  try { const { error } = await supabase.from(CHAT_TABLE).delete().eq("id", id); if (error) throw error; return true; }
  catch (e) { console.error("chatDelete error:", e); return false; }
};
// Auto-bersih: simpan hanya `keep` pesan terbaru, hapus sisanya (chat ngurus dirinya sendiri).
storage.chatPrune = async (keep = 300) => {
  try {
    const { data, error } = await supabase.from(CHAT_TABLE).select("ts").order("ts", { ascending: false }).range(keep, keep);
    if (error || !data || !data.length) return; // pesan masih ≤ keep, tidak ada yang perlu dihapus
    await supabase.from(CHAT_TABLE).delete().lt("ts", data[0].ts);
  } catch (e) { console.error("chatPrune error:", e); }
};
// Auto-bersih mingguan: hapus pesan yang lebih tua dari `days` hari.
storage.chatPruneOld = async (days = 7) => {
  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    await supabase.from(CHAT_TABLE).delete().lt("ts", cutoff);
  } catch (e) { console.error("chatPruneOld error:", e); }
};
storage.chatSubscribe = (cb) => {
  const channel = supabase
    .channel("chat-stream")
    .on("postgres_changes", { event: "*", schema: "public", table: CHAT_TABLE }, () => cb())
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch (e) {} };
};

/* ===== ABSENSI: tabel terpisah (append-only style) supaya absen barengan tidak saling timpa.
   Lihat supabase/migrations/attendance_table.sql. clockIn = INSERT 1 baris, clockOut = UPDATE
   baris itu saja — TIDAK menimpa blob kv, jadi tidak bisa ketimpa perubahan lain (unit, task, dll).
   Reads di App.jsx tetap lewat state.attendance yang di-load dari tabel ini saat loadState. ===== */
const ATT_TABLE = "attendance";
const attRowToRec = (r) => ({
  id: r.id, userId: r.user_id, date: r.date,
  clockIn: r.clock_in || undefined, photo: r.photo || "",
  clockOut: r.clock_out || undefined, photoOut: r.photo_out || undefined,
});
// Balik null kalau GAGAL fetch (beda dari [] yang berarti tabel kosong) — caller pakai ini
// untuk memutuskan fallback ke data blob lama, bukan menimpa dgn kosong.
storage.attList = async () => {
  try {
    const { data, error } = await supabase.from(ATT_TABLE).select("*").order("date", { ascending: true });
    if (error) throw error;
    return (data || []).map(attRowToRec);
  } catch (e) { console.error("attList error:", e); return null; }
};
storage.attClockIn = async (rec) => {
  try {
    // upsert by id (id deterministik per user+tanggal) → retry setelah gagal-verifikasi tidak
    // bikin baris dobel; kolom clock_out/photo_out yang tidak disebут tidak ikut ketimpa.
    const { error } = await supabase.from(ATT_TABLE).upsert({
      id: rec.id, user_id: rec.userId, date: rec.date, clock_in: rec.clockIn || null, photo: rec.photo || null,
    }, { onConflict: "id" });
    if (error) throw error;
    return { ok: true };
  } catch (e) { console.error("attClockIn error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
storage.attClockOut = async (id, clockOut, photoOut) => {
  try {
    const { error } = await supabase.from(ATT_TABLE).update({ clock_out: clockOut || null, photo_out: photoOut || null }).eq("id", id);
    if (error) throw error;
    return { ok: true };
  } catch (e) { console.error("attClockOut error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
// Verifikasi pasca-simpan: baca ulang 1 baris untuk memastikan benar-benar tersimpan di server.
storage.attGet = async (id) => {
  try {
    const { data, error } = await supabase.from(ATT_TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? attRowToRec(data) : null;
  } catch (e) { console.error("attGet error:", e); return null; }
};
// Migrasi sekali: pindahkan absen lama dari blob kv ke tabel. upsert by id = idempotent (aman diulang).
storage.attMigrate = async (recs) => {
  try {
    const rows = (recs || []).filter((r) => r && r.id && r.userId && r.date).map((r) => ({
      id: r.id, user_id: r.userId, date: r.date,
      clock_in: r.clockIn || null, photo: r.photo || null, clock_out: r.clockOut || null, photo_out: r.photoOut || null,
    }));
    if (!rows.length) return { ok: true, migrated: 0 };
    const { error } = await supabase.from(ATT_TABLE).upsert(rows, { onConflict: "id" });
    if (error) throw error;
    return { ok: true, migrated: rows.length };
  } catch (e) { console.error("attMigrate error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
// Buang foto absen yang lebih tua dari `days` hari (catatan absennya tetap ada) — biar payload
// attList tidak membengkak seiring waktu, sama semangatnya dgn prunePhotos di blob.
storage.attPrunePhotos = async (days = 2) => {
  try {
    const d = new Date(); d.setDate(d.getDate() - days);
    const p2 = (n) => String(n).padStart(2, "0");
    const cutoff = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    await supabase.from(ATT_TABLE).update({ photo: null, photo_out: null }).lt("date", cutoff).not("photo", "is", null);
  } catch (e) { console.error("attPrunePhotos error:", e); }
};
storage.attSubscribe = (cb) => {
  const channel = supabase.channel("attendance-stream")
    .on("postgres_changes", { event: "*", schema: "public", table: ATT_TABLE }, () => cb())
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch (e) {} };
};

/* ===== TASK: tabel terpisah (sama pola dgn attendance/chat) supaya assign/centang/hapus task
   tidak saling timpa saat blob kv ditulis ulang. assign = INSERT, centang/edit = UPDATE, hapus =
   DELETE — 1 baris per operasi. Reads di App.jsx tetap lewat state.tasks yang di-load dari sini. */
const TASK_TABLE = "tasks";
const taskRowToRec = (r) => ({ id: r.id, userId: r.user_id, title: r.title || "", done: !!r.done, setBy: r.set_by || "self", date: r.date || "" });
storage.taskList = async () => {
  try {
    const { data, error } = await supabase.from(TASK_TABLE).select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(taskRowToRec);
  } catch (e) { console.error("taskList error:", e); return null; } // null = GAGAL (beda dari [] kosong)
};
storage.taskAdd = async (rec) => {
  try {
    // upsert by id → aman kalau kepanggil dobel (retry), tidak bikin baris ganda.
    const { error } = await supabase.from(TASK_TABLE).upsert({
      id: rec.id, user_id: rec.userId, title: rec.title || "", done: !!rec.done, set_by: rec.setBy || "self", date: rec.date || null,
    }, { onConflict: "id" });
    if (error) throw error;
    return { ok: true };
  } catch (e) { console.error("taskAdd error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
storage.taskToggle = async (id, done) => {
  try { const { error } = await supabase.from(TASK_TABLE).update({ done: !!done }).eq("id", id); if (error) throw error; return { ok: true }; }
  catch (e) { console.error("taskToggle error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
storage.taskEdit = async (id, title) => {
  try { const { error } = await supabase.from(TASK_TABLE).update({ title: title || "" }).eq("id", id); if (error) throw error; return { ok: true }; }
  catch (e) { console.error("taskEdit error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
storage.taskDelete = async (id) => {
  try { const { error } = await supabase.from(TASK_TABLE).delete().eq("id", id); if (error) throw error; return { ok: true }; }
  catch (e) { console.error("taskDelete error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
storage.taskDeleteByUser = async (userId) => {
  try { const { error } = await supabase.from(TASK_TABLE).delete().eq("user_id", userId); if (error) throw error; return { ok: true }; }
  catch (e) { console.error("taskDeleteByUser error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
// Migrasi sekali dari blob kv ke tabel (upsert by id = idempotent).
storage.taskMigrate = async (recs) => {
  try {
    const rows = (recs || []).filter((r) => r && r.id).map((r) => ({
      id: r.id, user_id: r.userId, title: r.title || "", done: !!r.done, set_by: r.setBy || "self", date: r.date || null,
    }));
    if (!rows.length) return { ok: true, migrated: 0 };
    const { error } = await supabase.from(TASK_TABLE).upsert(rows, { onConflict: "id" });
    if (error) throw error;
    return { ok: true, migrated: rows.length };
  } catch (e) { console.error("taskMigrate error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
storage.taskSubscribe = (cb) => {
  const channel = supabase.channel("tasks-stream")
    .on("postgres_changes", { event: "*", schema: "public", table: TASK_TABLE }, () => cb())
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch (e) {} };
};

/* ===== VERIFIKASI: permohonan yang perlu disetujui (pembelian, keputusan, akses, dll).
   Tabel sendiri, pola sama dgn attendance/tasks/units. DDL-nya di sql/verifikasi.sql — harus
   dijalankan sekali di Supabase SQL Editor sebelum fitur ini bisa dipakai.
   requested_by/verified_by = id user app (TEXT, mis. "u_own"), bukan UUID auth. ===== */
const VERIF_TABLE = "verifikasi";
storage.verifList = async () => {
  try {
    const { data, error } = await supabase.from(VERIF_TABLE).select("*").order("requested_at", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) { console.error("verifList error:", e); return null; } // null = GAGAL (beda dari [] kosong)
};
storage.verifAdd = async (rec) => {
  try {
    const { data, error } = await supabase.from(VERIF_TABLE).insert({
      type: rec.type, title: rec.title, description: rec.description || "",
      requested_by: rec.requestedBy, status: "pending", metadata: rec.metadata || {},
    }).select("*").maybeSingle();
    if (error) throw error;
    return { ok: true, row: data || null };
  } catch (e) { console.error("verifAdd error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
/* Keputusan (approved/rejected/cancelled). Filter `.eq("status","pending")` itu kuncinya:
   dua HP yang menekan Setujui/Tolak bersamaan tidak saling menimpa — yang kedua tidak kena baris
   mana pun dan balik { ok:false, stale:true }, jadi layarnya bisa bilang "sudah diputus orang lain"
   alih-alih diam-diam menindih keputusan pertama. */
storage.verifDecide = async (id, status, byUserId, notes) => {
  try {
    const { data, error } = await supabase.from(VERIF_TABLE)
      .update({ status, verified_by: byUserId || null, verified_at: new Date().toISOString(), verification_notes: notes || null })
      .eq("id", id).eq("status", "pending").select("*");
    if (error) throw error;
    if (!data || !data.length) return { ok: false, stale: true };
    return { ok: true, row: data[0] };
  } catch (e) { console.error("verifDecide error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
storage.verifSubscribe = (cb) => {
  const channel = supabase.channel("verifikasi-stream")
    .on("postgres_changes", { event: "*", schema: "public", table: VERIF_TABLE }, () => cb())
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch (e) {} };
};

/* ===== UNIT MOTOR: tabel terpisah (sama pola dgn attendance/tasks) supaya tambah/edit/status/
   hapus unit tidak saling timpa saat blob kv ditulis ulang. Seluruh objek unit disimpan di kolom
   `data` (JSONB) → tidak ada field yang bisa hilang (termasuk inspectionResult + foto). Reads di
   App.jsx tetap lewat state.units yang di-load dari tabel ini. ===== */
const UNIT_TABLE = "units";
storage.unitList = async () => {
  try {
    const { data, error } = await supabase.from(UNIT_TABLE).select("data,created_at").order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map((r) => r.data).filter(Boolean);
  } catch (e) { console.error("unitList error:", e); return null; } // null = GAGAL (beda dari [] kosong)
};
storage.unitSave = async (unit) => {
  try {
    if (!unit || !unit.id) return { ok: false, error: "unit tanpa id" };
    const { error } = await supabase.from(UNIT_TABLE).upsert({ id: unit.id, data: unit, status: unit.status || null, updated_at: Date.now() }, { onConflict: "id" });
    if (error) throw error;
    return { ok: true };
  } catch (e) { console.error("unitSave error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
storage.unitDelete = async (id) => {
  try { const { error } = await supabase.from(UNIT_TABLE).delete().eq("id", id); if (error) throw error; return { ok: true }; }
  catch (e) { console.error("unitDelete error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
// Migrasi sekali dari blob kv ke tabel (upsert by id = idempotent, aman diulang, tidak menimpa
// perubahan lebih baru karena cuma dijalankan saat _unitMigrated masih false).
storage.unitMigrate = async (units) => {
  try {
    const rows = (units || []).filter((u) => u && u.id).map((u) => ({ id: u.id, data: u, status: u.status || null, updated_at: Date.now() }));
    if (!rows.length) return { ok: true, migrated: 0 };
    const { error } = await supabase.from(UNIT_TABLE).upsert(rows, { onConflict: "id" });
    if (error) throw error;
    return { ok: true, migrated: rows.length };
  } catch (e) { console.error("unitMigrate error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};
storage.unitSubscribe = (cb) => {
  const channel = supabase.channel("units-stream")
    .on("postgres_changes", { event: "*", schema: "public", table: UNIT_TABLE }, () => cb())
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch (e) {} };
};

/* ===== HANDBOOK: file PDF disimpan di Supabase Storage (bucket "handbook") =====
   File selalu bernama tetap "handbook.pdf" supaya gampang di-replace & URL stabil.
   Metadata kecil (tanggal update) disimpan di kv "motorell-handbook-meta". */
const HANDBOOK_BUCKET = "handbook";
const HANDBOOK_FILE = "handbook.pdf";
storage.getHandbookUrl = (bust) => {
  try {
    const { data } = supabase.storage.from(HANDBOOK_BUCKET).getPublicUrl(HANDBOOK_FILE);
    let url = data && data.publicUrl;
    if (!url) return null;
    if (bust) url += (url.includes("?") ? "&" : "?") + "t=" + bust; // cache-bust biar semua HP dapat versi terbaru
    return url;
  } catch (e) { console.error("getHandbookUrl error:", e); return null; }
};
storage.uploadHandbook = async (file) => {
  try {
    const { error } = await supabase.storage
      .from(HANDBOOK_BUCKET)
      .upload(HANDBOOK_FILE, file, { upsert: true, contentType: "application/pdf", cacheControl: "3600" });
    if (error) throw error;
    const updatedAt = Date.now();
    await storage.set("motorell-handbook-meta", JSON.stringify({ updatedAt }), true);
    return { ok: true, url: storage.getHandbookUrl(updatedAt), updatedAt };
  } catch (e) { console.error("uploadHandbook error:", e); return { ok: false, error: String((e && e.message) || e) }; }
};

/* ===== Web Push: simpan subscription & kirim push lewat Edge Function ===== */
storage.savePushSub = async (userId, sub) => {
  try {
    const endpoint = sub && sub.endpoint;
    if (!endpoint) return false;
    const { error } = await supabase.from("push_subs").upsert({ endpoint, user_id: userId, sub, updated: Date.now() }, { onConflict: "endpoint" });
    if (error) throw error;
    return true;
  } catch (e) { console.error("savePushSub error:", e); return false; }
};
storage.deletePushSub = async (endpoint) => {
  try { if (endpoint) await supabase.from("push_subs").delete().eq("endpoint", endpoint); } catch (e) { console.error("deletePushSub error:", e); }
};
storage.sendPush = async (toUserIds, title, body, url, force) => {
  const payload = { toUserIds, title, body: body || "", url: url || "/", force: !!force };
  const call = async (name) => { try { return await supabase.functions.invoke(name, { body: payload }); } catch (e) { return { error: e }; } };
  try {
    if (!toUserIds || !toUserIds.length) return { ok: false, error: "Tidak ada penerima" };
    const r = await call("send-push");
    if (!r.error) return { ok: true, data: r.data, via: "send-push" };
    // Fallback: nama function lama yang typo (send-psuh) biar tetap jalan sementara
    const r2 = await call("send-psuh");
    if (!r2.error) return { ok: true, data: r2.data, via: "send-psuh" };
    const status = (r.error && r.error.context && r.error.context.status) || (r.error && r.error.status) || 0;
    console.error("sendPush error:", r.error);
    return { ok: false, status, error: String((r.error && r.error.message) || r.error) };
  } catch (e) { console.error("sendPush error:", e); return { ok: false, error: String(e) }; }
};

if (typeof window !== "undefined") {
  window.storage = storage;
}

// Klien Supabase dibuka juga supaya modul lain (mis. src/lib/supabase/transaksi.ts) memakai
// klien yang SAMA. Bikin createClient() kedua = dua koneksi realtime ke project yang sama.
export { supabase };

export default storage;