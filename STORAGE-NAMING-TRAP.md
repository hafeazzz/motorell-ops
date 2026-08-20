# Jebakan nama `storage` ⚠️

## Masalahnya

Selama masa migrasi ada **dua** hal berbeda bernama `storage`:

```js
// src/firebaseConfig.js — Firebase Storage
export const storage = getStorage(app);

// src/storage.js — lapisan Supabase yang dipakai SELURUH app
export default storage;          // objek besar: get/set/unitList/attList/chatSend/…
export { supabase };
```

Salah impor **tidak menimbulkan error**. Kodenya jalan, cuma menulis ke backend yang salah.

## Yang bikin lebih licin di repo ini

`src/storage.js` bukan cuma pembungkus Storage. Isinya seluruh lapisan data: `storage.get/set`
(blob kv), `unitList/unitSave`, `attList`, `taskList`, `chatSend`, `verifList`, `stnkUpload`,
`savePushSub`, `sendPush`. Dan `App.jsx` **tidak pernah mengimpornya** — dipakai sebagai global
`window.storage`, dipasang di `src/main.jsx` sebelum App dirender.

Artinya:

- Sekarang `App.jsx` **nol** impor dari `./storage`, jadi mencari `import ... from './storage'`
  di App.jsx akan selalu kosong. Bukan berarti aman — jalur Supabase-nya lewat `window.storage`.
- Menambah `import { storage } from './firebaseConfig'` ke App.jsx aman dari sisi nama, tapi
  jangan sampai bikin siapa pun mengira `window.storage` ikut pindah.

## Aturan selama migrasi

```js
// Firebase Storage — SELALU lewat helper, jangan pegang objeknya langsung
import { uploadPhoto, deletePhoto } from "./firebaseService";

// Supabase (masih dipakai sampai storage.js ditulis ulang)
window.storage.stnkUpload(unitId, blob);
```

Kalau memang perlu objek Firebase Storage mentah, beri nama beda supaya tidak samar:

```js
import { storage as fbStorage } from "./firebaseConfig";
import { ref, uploadBytes } from "firebase/storage";
await uploadBytes(ref(fbStorage, path), file);
```

## Cara mengecek

```bash
# Apakah App.jsx mengimpor storage dari mana pun? (harusnya kosong — pakai window.storage)
grep -n "from ['\"]\./storage" src/App.jsx

# Semua pemakaian jalur Supabase di App.jsx:
grep -c "window.storage" src/App.jsx

# Apakah ada yang mengimpor Firebase Storage mentah?
grep -rn "from ['\"]\./firebaseConfig" src/
```

Selama `src/storage.js` belum ditulis ulang, **jawaban yang benar adalah: jalur Supabase masih
dipakai di mana-mana.** Itu memang disengaja. Bahayanya baru muncul kalau sebagian foto mulai
diarahkan ke Firebase sementara sisanya masih ke Supabase — foto lama tak bisa dibuka, foto baru
tak muncul di tempat lama, dan tidak ada satu pun error yang menjelaskan kenapa.

## Aturan praktis

Pindahkan **satu jalur data sekaligus**, dan tuntas. Jangan setengah-setengah:
setengah foto di Supabase + setengah di Firebase jauh lebih sulit dibereskan daripada
semuanya masih di Supabase.
