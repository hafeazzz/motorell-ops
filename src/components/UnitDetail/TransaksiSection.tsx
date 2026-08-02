/* Riwayat layanan satu unit motor. Berdiri sendiri: cuma butuh unitId, ambil datanya sendiri,
   dan tidak mengimpor apa pun dari App.jsx (pola yang sama dengan SearchResultsOverlay).

   CATATAN STYLING: proyek ini tidak memasang styled-jsx, jadi <style jsx> tidak akan ter-scope —
   CSS-nya malah bocor jadi global. Yang dipakai di sini kelas tema milik app sendiri (s-surface,
   s-border, s-muted, tg-*) yang seluruhnya bersandar pada CSS variable di .mr-app, plus Tailwind
   (dimuat via CDN di index.html). Efeknya sama: nol warna hardcoded, ikut light/dark otomatis.

   PENTING: komponen ini HARUS dirender di dalam pohon .mr-app. Variabel tema (--surface, --border,
   dst.) dideklarasikan di root .mr-app, jadi apa pun yang dirender di luar situ (mis. lewat
   createPortal ke document.body) akan keluar transparan. */
import React, { useCallback, useEffect, useState } from "react";
import {
  deleteTransaksi,
  getTransaksiDetail,
  updateTransaksiStatus,
  STATUS_LIST,
  type Transaksi,
  type TransaksiStatus,
} from "../../lib/supabase/transaksi";

interface Props {
  unitId: string;
}

const LABEL: Record<TransaksiStatus, string> = {
  pending: "Menunggu",
  proses: "Dikerjakan",
  selesai: "Selesai",
  batal: "Batal",
};

/* Warna badge memakai kelas tg-* yang sudah ada di App.jsx — sudah sadar light/dark. */
const WARNA: Record<TransaksiStatus, string> = {
  pending: "tg-amber",
  proses: "tg-blue",
  selesai: "tg-emerald",
  batal: "tg-rose",
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/* Kolom tanggal Postgres datang sebagai "YYYY-MM-DD". new Date("2026-08-02") diurai sebagai UTC
   tengah malam, jadi di zona barat tanggalnya mundur sehari — makanya ditambah T00:00:00 supaya
   dibaca sebagai waktu lokal. */
function tanggalID(nilai: string | null): string {
  if (!nilai) return "-";
  const iso = nilai.length === 10 ? `${nilai}T00:00:00` : nilai;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function TransaksiSection({ unitId }: Props) {
  const [daftar, setDaftar] = useState<Transaksi[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null); // id baris yang lagi diproses

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    const data = await getTransaksiDetail(unitId);
    setDaftar(data);
    setMemuat(false);
    return data;
  }, [unitId]);

  useEffect(() => {
    if (!unitId) return;
    let batal = false;
    (async () => {
      setMemuat(true);
      setGalat(null);
      const data = await getTransaksiDetail(unitId);
      if (batal) return; // unit keburu ganti / komponen dilepas → jangan setState
      setDaftar(data);
      setMemuat(false);
    })();
    return () => { batal = true; };
  }, [unitId]);

  const gantiStatus = async (t: Transaksi, status: TransaksiStatus) => {
    if (status === t.status) return;
    setSibuk(t.id);
    setGalat(null);
    const baris = await updateTransaksiStatus(t.id, status);
    setSibuk(null);
    if (!baris) {
      // Gagal simpan tidak boleh terlihat seperti berhasil — daftar dibiarkan apa adanya.
      setGalat("Gagal mengubah status. Cek koneksi lalu coba lagi.");
      return;
    }
    setDaftar((s) => s.map((x) => (x.id === baris.id ? baris : x)));
  };

  const hapus = async (t: Transaksi) => {
    if (!window.confirm(`Hapus layanan "${t.deskripsi}"? Datanya tetap tersimpan, cuma disembunyikan.`)) return;
    setSibuk(t.id);
    setGalat(null);
    const ok = await deleteTransaksi(t.id);
    setSibuk(null);
    if (!ok) {
      setGalat("Gagal menghapus. Cek koneksi lalu coba lagi.");
      return;
    }
    setDaftar((s) => s.filter((x) => x.id !== t.id));
  };

  if (memuat) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-bold s-muted mb-2">Riwayat layanan</p>
        {[0, 1].map((i) => (
          <div key={i} className="s-soft rounded-xl h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-bold s-muted">Riwayat layanan</p>
        {daftar.length > 0 && <span className="text-[10px] s-muted">{daftar.length} entri</span>}
      </div>

      {galat && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-rose-500 font-semibold">{galat}</p>
          <button type="button" onClick={() => void muat()} className="text-[11px] font-bold underline shrink-0">
            Muat ulang
          </button>
        </div>
      )}

      {daftar.length === 0 && !galat && (
        <p className="text-xs s-muted py-6 text-center">Belum ada riwayat layanan.</p>
      )}

      {daftar.map((t) => (
        <div
          key={t.id}
          className={`s-surface s-border border rounded-xl p-3 transition hover:shadow-md ${sibuk === t.id ? "opacity-60 pointer-events-none" : ""}`}
        >
          {/* Mobile: menumpuk. >=sm: kiri keterangan, kanan harga + aksi. */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{t.jenis_layanan?.nama || "Lainnya"}</span>
                <span className={`${WARNA[t.status] || "tg-slate"} text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0`}>
                  {LABEL[t.status] || t.status}
                </span>
              </div>
              {t.deskripsi && <p className="text-xs s-muted mt-0.5 break-words">{t.deskripsi}</p>}
              <p className="text-[10px] s-muted mt-1">
                Mulai {tanggalID(t.tanggal_mulai)}
                {t.tanggal_selesai ? ` · Selesai ${tanggalID(t.tanggal_selesai)}` : ""}
              </p>
              {t.catatan && <p className="text-[10px] s-muted italic mt-0.5 break-words">{t.catatan}</p>}
            </div>

            <div className="flex items-center gap-2 sm:flex-col sm:items-end shrink-0">
              <p className="text-sm font-bold whitespace-nowrap">{rupiah.format(Number(t.harga) || 0)}</p>
              <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                <select
                  value={t.status}
                  disabled={sibuk === t.id}
                  onChange={(e) => void gantiStatus(t, e.target.value as TransaksiStatus)}
                  aria-label={`Ubah status ${t.deskripsi}`}
                  className="s-input text-[11px] rounded-lg px-2 py-1"
                >
                  {STATUS_LIST.map((s) => (
                    <option key={s} value={s}>{LABEL[s]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void hapus(t)}
                  disabled={sibuk === t.id}
                  title="Hapus layanan"
                  aria-label={`Hapus ${t.deskripsi}`}
                  className="w-7 h-7 grid place-items-center rounded-lg s-soft active:scale-90 transition text-rose-500"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
