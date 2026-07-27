#!/usr/bin/env node
/* MotorellOps — monitor pemakaian database (READ-ONLY).
 *
 * Jalankan kapan pun penasaran:  node scripts/opsMonitoring.mjs
 *
 * Aman: hanya MEMBACA. Tidak menulis, tidak menghapus, tidak butuh service-role key
 * (pakai anon/publishable key yang memang sudah publik di client). Tidak membuat tabel.
 *
 * Melaporkan tabel yang BENAR-BENAR ada di MotorellOps (kv, units, attendance, tasks,
 * push_subs, chat) — bukan tabel imajiner (users/inspections/maintenance_logs). Users &
 * inspeksi hidup di dalam blob JSON `kv`, bukan tabel sendiri.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://txmrcgvcfgfulwelideb.supabase.co";
const KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_csR5fqVv0BDZEr8R1ZXQfg_4WBG5QYH";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const LIMIT_MB = 500; // limit tier Supabase
const mb = (b) => (b / 1048576).toFixed(2);

async function rowCount(table) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
    if (!r.ok) return null; // 404 = tabel tidak ada
    const m = (r.headers.get("content-range") || "").match(/\/(\d+)$/);
    return m ? +m[1] : 0;
  } catch (e) { return null; }
}

async function payloadBytes(url) {
  try {
    const r = await fetch(url, { headers: H });
    if (!r.ok) return 0;
    return new TextEncoder().encode(await r.text()).length;
  } catch (e) { return 0; }
}

(async () => {
  console.log("=== MotorellOps — Monitor Pemakaian (READ-ONLY) ===");
  console.log("Waktu:", new Date().toISOString(), "\n");

  const tables = ["kv", "units", "attendance", "tasks", "push_subs", "chat"];
  console.log("Jumlah baris per tabel (asli):");
  for (const t of tables) {
    const c = await rowCount(t);
    console.log(`  ${t.padEnd(12)} ${c == null ? "(tidak ada / tak terbaca)" : c + " baris"}`);
  }

  // Payload data terbesar — didominasi foto base64 (vektor pertumbuhan utama)
  const blobBytes = await payloadBytes(`${SUPABASE_URL}/rest/v1/kv?key=eq.motorell-state-v3&select=value`);
  const unitsBytes = await payloadBytes(`${SUPABASE_URL}/rest/v1/units?select=data`);
  const attBytes = await payloadBytes(`${SUPABASE_URL}/rest/v1/attendance?select=photo,photo_out`);
  const chatBytes = await payloadBytes(`${SUPABASE_URL}/rest/v1/chat?select=photo`);
  const totalData = blobBytes + unitsBytes + attBytes + chatBytes;
  const pct = (totalData / 1048576 / LIMIT_MB) * 100;

  console.log("\nUkuran payload data (perkiraan; dominan foto base64):");
  console.log(`  state blob (kv)   ${mb(blobBytes)} MB`);
  console.log(`  tabel units       ${mb(unitsBytes)} MB`);
  console.log(`  foto attendance   ${mb(attBytes)} MB`);
  console.log(`  foto chat         ${mb(chatBytes)} MB`);
  console.log(`  ----------------`);
  console.log(`  total footprint   ${mb(totalData)} MB / ${LIMIT_MB} MB  (${pct.toFixed(2)}%)`);

  console.log("\nCatatan:");
  console.log("- Ini perkiraan FOOTPRINT DATA (payload REST), bukan ukuran disk Postgres persis");
  console.log("  (overhead indeks/WAL tidak terhitung; ukuran disk asli biasanya lebih besar sedikit).");
  console.log("- Foto absen/live & chat sudah di-prune otomatis oleh app (PHOTO_TTL_DAYS, chatPrune).");
  console.log(pct < 50 ? "\n✅ Sehat — jauh di bawah limit, tidak perlu tindakan." : "\n⚠️ Sudah lewat separuh limit — cek pertumbuhan foto (units/blob).");
})().catch((e) => { console.error("Monitor gagal:", e && e.message ? e.message : e); process.exit(1); });
