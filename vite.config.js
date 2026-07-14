import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ID build — dipakai untuk mendeteksi deploy baru (service worker + cek versi berkala).
// Di Vercel diambil dari commit SHA; build lokal pakai timestamp; dev pakai "dev"
// supaya cek versi tidak jalan & tidak bikin reload-loop waktu ngoding.
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  (process.env.NODE_ENV === "production" ? String(Date.now()) : "dev");

// Sajikan /version.json berisi build id yang sedang online. App membandingkannya dengan
// build id yang sedang jalan di HP/browser — kalau beda berarti ada deploy baru.
function versionEndpoint() {
  const body = () => JSON.stringify({ version: BUILD_ID, timestamp: Date.now() });
  return {
    name: "motorell-version-endpoint",
    configureServer(server) {
      server.middlewares.use("/version.json", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(body());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: body() });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionEndpoint()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
});
