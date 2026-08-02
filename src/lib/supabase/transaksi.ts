/* Query Supabase untuk riwayat layanan per unit motor (tabel `transaksi_detail`).
   Semua fungsi menelan error-nya sendiri: balikin [] / null dan catat ke console, biar satu
   query gagal tidak menjatuhkan layar. Pola sama dengan src/storage.js.

   CATATAN IMPOR: proyek ini TIDAK punya alias "@/", jadi klien Supabase diambil relatif dari
   src/storage.js — klien yang SAMA dengan yang dipakai seluruh app. Jangan createClient() lagi
   di sini: dua klien = dua koneksi realtime ke project yang sama. */
import { supabase } from "../../storage";

export type TransaksiStatus = "pending" | "proses" | "selesai" | "batal";

export interface JenisLayanan {
  id: string;
  nama: string;
  deskripsi: string | null;
  created_at: string;
}

export interface Transaksi {
  id: string;
  /** TEXT, bukan UUID — mengikuti units.id yang berupa TEXT. */
  unit_id: string;
  jenis_layanan_id: string | null;
  deskripsi: string;
  harga: number;
  catatan: string | null;
  status: TransaksiStatus;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  /** Hasil embed PostgREST lewat foreign key jenis_layanan_id. */
  jenis_layanan?: JenisLayanan | null;
}

export interface CreateTransaksiPayload {
  jenis_layanan_id?: string | null;
  deskripsi: string;
  harga: number;
  catatan?: string | null;
  status?: TransaksiStatus;
  tanggal_mulai?: string | null;
}

const TABLE = "transaksi_detail";
const JENIS_TABLE = "jenis_layanan";
/** Embed jenis layanan sekalian, supaya daftar tidak perlu query kedua per baris. */
const SELECT = "*,jenis_layanan(id,nama,deskripsi,created_at)";

export const STATUS_LIST: TransaksiStatus[] = ["pending", "proses", "selesai", "batal"];

/* Baris "belum dihapus" = is_deleted false ATAU null. Sengaja tidak pakai .eq("is_deleted", false):
   kalau ada baris lama yang kolomnya NULL (mis. ditambah sebelum DEFAULT false dipasang), .eq()
   akan menyembunyikannya diam-diam — persis jenis bug "data hilang padahal ada" yang mahal. */
const belumDihapus = <T>(q: T): T => (q as any).not("is_deleted", "is", true);

/** Semua transaksi milik satu unit, terbaru dulu. Balik [] kalau gagal / unitId kosong. */
export async function getTransaksiDetail(unitId: string): Promise<Transaksi[]> {
  if (!unitId) return [];
  try {
    const { data, error } = await belumDihapus(
      supabase.from(TABLE).select(SELECT).eq("unit_id", unitId)
    )
      .order("tanggal_mulai", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as Transaksi[]) || [];
  } catch (e) {
    console.error("getTransaksiDetail error:", e);
    return [];
  }
}

/** Daftar jenis layanan untuk dropdown. Balik [] kalau gagal. */
export async function getJenisLayanan(): Promise<JenisLayanan[]> {
  try {
    const { data, error } = await supabase.from(JENIS_TABLE).select("*").order("nama", { ascending: true });
    if (error) throw error;
    return (data as JenisLayanan[]) || [];
  } catch (e) {
    console.error("getJenisLayanan error:", e);
    return [];
  }
}

/** Satu transaksi berikut jenis layanannya. Balik null kalau tidak ada / gagal. */
export async function getTransaksiById(transaksiId: string): Promise<Transaksi | null> {
  if (!transaksiId) return null;
  try {
    const { data, error } = await supabase.from(TABLE).select(SELECT).eq("id", transaksiId).maybeSingle();
    if (error) throw error;
    return (data as Transaksi) || null;
  } catch (e) {
    console.error("getTransaksiById error:", e);
    return null;
  }
}

/** Tambah transaksi. Balik barisnya (sudah lengkap dgn embed) atau null kalau gagal. */
export async function addTransaksi(unitId: string, payload: CreateTransaksiPayload): Promise<Transaksi | null> {
  if (!unitId) { console.error("addTransaksi error: unitId kosong"); return null; }
  try {
    const baris = {
      unit_id: unitId,
      jenis_layanan_id: payload.jenis_layanan_id ?? null,
      deskripsi: payload.deskripsi,
      harga: Number(payload.harga) || 0,
      catatan: payload.catatan ?? null,
      status: payload.status ?? "pending",
      tanggal_mulai: payload.tanggal_mulai ?? null,
      is_deleted: false,
    };
    // created_at/updated_at sengaja tidak dikirim — biarkan DEFAULT di database yang isi.
    const { data, error } = await supabase.from(TABLE).insert(baris).select(SELECT).maybeSingle();
    if (error) throw error;
    return (data as Transaksi) || null;
  } catch (e) {
    console.error("addTransaksi error:", e);
    return null;
  }
}

/** Soft delete — barisnya TIDAK dihapus, cuma ditandai is_deleted. Balik true kalau sukses. */
export async function deleteTransaksi(transaksiId: string): Promise<boolean> {
  if (!transaksiId) return false;
  try {
    const { error } = await supabase
      .from(TABLE)
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", transaksiId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("deleteTransaksi error:", e);
    return false;
  }
}

/** Ubah status. tanggal_selesai ikut diisi/dikosongkan mengikuti status "selesai". */
export async function updateTransaksiStatus(transaksiId: string, newStatus: TransaksiStatus): Promise<Transaksi | null> {
  if (!transaksiId) return null;
  if (!STATUS_LIST.includes(newStatus)) {
    console.error("updateTransaksiStatus error: status tidak dikenal:", newStatus);
    return null;
  }
  try {
    const patch: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
    // Tanggal selesai ikut status supaya keduanya tidak pernah bertentangan.
    patch.tanggal_selesai = newStatus === "selesai" ? new Date().toISOString().slice(0, 10) : null;
    const { data, error } = await supabase.from(TABLE).update(patch).eq("id", transaksiId).select(SELECT).maybeSingle();
    if (error) throw error;
    return (data as Transaksi) || null;
  } catch (e) {
    console.error("updateTransaksiStatus error:", e);
    return null;
  }
}
