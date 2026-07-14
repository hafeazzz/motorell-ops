import { useEffect, useState } from "react";

/* Inspeksi yang SEDANG berjalan disimpan di key Supabase-nya sendiri (bukan di dalam blob
   state utama) — persis alasan chat punya tabel sendiri: draft di-update tiap beberapa detik,
   dan kita tidak mau menulis ulang seluruh state app (termasuk foto base64) setiap ketukan.

   Isi key = array draft: { id, byName, name, progress, checked, total, notes, photos[], startedAt, updatedAt, status }
   Realtime lewat window.storage.subscribe; polling 3 detik dipasang sebagai jaring pengaman
   kalau channel realtime lagi ngambek. */
export const ACTIVE_KEY = "motorell-active-inspections";
const STALE_MS = 15 * 60 * 1000; // draft yang 15 menit tak di-update dianggap ditinggal (tab ditutup paksa)
const POLL_MS = 3000;
const MAX_PHOTOS = 4; // batasi payload draft — foto sudah dikompres, tapi jangan sampai membengkak

const readList = async () => {
  try {
    const r = await window.storage.get(ACTIVE_KEY, true);
    const list = r && r.value ? JSON.parse(r.value) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
};

const fresh = (list) => {
  const now = Date.now();
  return list.filter((x) => x && x.status === "ongoing" && now - (x.updatedAt || 0) < STALE_MS);
};

const writeList = async (list) => {
  try { await window.storage.set(ACTIVE_KEY, JSON.stringify(list), true); } catch (e) { console.error("active inspections write error:", e); }
};

// Publish/refresh draft milik satu inspektur. Read-modify-write: kalau dua inspektur menulis
// barengan, salah satu draft bisa kelewat — tapi tiap inspektur mem-publish ulang tiap beberapa
// detik, jadi entri yang hilang muncul lagi di tick berikutnya.
export async function publishDraft(draft) {
  if (!draft || !draft.id) return;
  const list = fresh(await readList()).filter((x) => x.id !== draft.id);
  list.push({ ...draft, photos: (draft.photos || []).slice(0, MAX_PHOTOS), status: "ongoing", updatedAt: Date.now() });
  await writeList(list);
}

export async function clearDraft(id) {
  if (!id) return;
  const list = await readList();
  if (!list.some((x) => x && x.id === id)) return; // tidak ada yang perlu dihapus
  await writeList(fresh(list).filter((x) => x.id !== id));
}

export function useInspectionMonitoring() {
  const [activeInspections, setActiveInspections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      const list = fresh(await readList());
      if (dead) return;
      setActiveInspections(list);
      setLoading(false);
    };
    load();

    let unsub = null;
    try { if (window.storage && window.storage.subscribe) unsub = window.storage.subscribe(ACTIVE_KEY, load); } catch (e) {}
    const timer = setInterval(load, POLL_MS);

    return () => { dead = true; clearInterval(timer); if (unsub) unsub(); };
  }, []);

  return { activeInspections, loading };
}

export default useInspectionMonitoring;
