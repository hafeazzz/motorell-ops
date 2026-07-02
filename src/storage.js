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
storage.chatSubscribe = (cb) => {
  const channel = supabase
    .channel("chat-stream")
    .on("postgres_changes", { event: "*", schema: "public", table: CHAT_TABLE }, () => cb())
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch (e) {} };
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
storage.sendPush = async (toUserIds, title, body, url) => {
  try {
    if (!toUserIds || !toUserIds.length) return;
    await supabase.functions.invoke("send-push", { body: { toUserIds, title, body: body || "", url: url || "/" } });
  } catch (e) { console.error("sendPush error:", e); }
};

if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;