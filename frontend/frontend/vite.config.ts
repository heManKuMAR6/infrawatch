import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/stream": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/findings": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/chunks": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/report": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
