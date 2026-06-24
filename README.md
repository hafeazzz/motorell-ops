# Motorell Ops

Versi project Vite dari app Motorell Ops kamu. Tinggal jalan, datanya nyimpan,
dan bisa di-deploy ke Vercel.

---

## 1. Yang perlu diinstall dulu (sekali aja)

Kamu butuh **Node.js**. Cek dulu udah ada belum — buka terminal di VS Code
(`Ctrl + ` atau menu Terminal → New Terminal), ketik:

```bash
node -v
```

Kalau muncul angka (misal `v20.11.0`), berarti udah ada, lanjut.
Kalau "command not found", install dulu dari https://nodejs.org (pilih yang **LTS**).

---

## 2. Jalanin di laptop (development)

Di terminal, masuk ke folder ini, terus:

```bash
npm install
npm run dev
```

Nanti muncul tulisan kayak gini:

```
  ➜  Local:   http://localhost:5173/
```

Buka `http://localhost:5173/` di browser. **Selesai — app-nya jalan.**

> Login owner: password-nya `@Motorell#`
> Staff: pas login pertama bikin password sendiri.

Tiap kamu ubah kode dan save, web-nya otomatis refresh sendiri.

---

## 3. ⚠️ Soal penyimpanan data (PENTING dibaca)

Versi ini nyimpan data pakai **localStorage** browser. Artinya:

- ✅ Data nyimpan walaupun di-refresh / browser ditutup.
- ✅ Bisa langsung deploy ke Vercel.
- ❌ Data cuma ada di **1 browser di 1 perangkat**.

Jadi: data di HP kamu **beda** sama data di HP staff. Owner **nggak bisa** lihat
absen/konten yang di-input staff dari HP mereka, dan chat **nggak nyambung**
antar orang. Tiap perangkat itu "pulau" sendiri-sendiri.

Ini cocok banget buat **demo, tes, atau dipakai 1 orang**. Kalau nanti mau
**semua HP nyambung** (multi-user beneran), tinggal ganti isi file
`src/storage.js` pakai Supabase — kode app-nya (`src/App.jsx`) nggak perlu diubah.
Tanya aku lagi nanti kalau udah siap ke tahap itu.

---

## 4. Deploy ke Vercel (biar bisa dibuka dari HP via link)

**Cara paling gampang (lewat GitHub):**

1. Upload folder ini ke GitHub (bikin repo baru, push).
2. Buka https://vercel.com, login pakai GitHub.
3. Klik **Add New → Project**, pilih repo-nya.
4. Vercel otomatis ngeh ini Vite. Biarin aja settingnya:
   - Build Command: `vite build`
   - Output Directory: `dist`
5. Klik **Deploy**. Tunggu sebentar, jadi deh link-nya (misal
   `motorell-ops.vercel.app`).

**Atau lewat terminal (tanpa GitHub):**

```bash
npm install -g vercel
vercel
```

Ikutin pertanyaannya (Enter terus aja buat default), nanti dikasih link.

---

## Struktur folder

```
motorell-ops/
├─ index.html          ← halaman utama + Tailwind CDN
├─ package.json        ← daftar dependency
├─ vite.config.js      ← config Vite
└─ src/
   ├─ main.jsx         ← titik masuk React
   ├─ storage.js       ← pengganti window.storage (localStorage)
   └─ App.jsx          ← kode app kamu (nggak diubah)
```
