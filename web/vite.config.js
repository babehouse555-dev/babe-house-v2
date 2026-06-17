import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// dev: proxy /api ไป backend (3000) | build: ออกไป dist/ ให้ Express เสิร์ฟ
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } }
});
