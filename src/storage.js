import { createClient } from "@supabase/supabase-js";

/* ============================================================
* storage.js — versi SUPABASE (multi-user, semua HP nyambung)
* Data tim (shared) disimpan ONLINE di Supabase.
* Data pribadi (tema, suara) tetap di tiap HP (localStorage).
* App.jsx TIDAK diubah — cukup file ini.
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
};

if (typeof window !== "undefined") {
window.storage = storage;
}

export default storage;