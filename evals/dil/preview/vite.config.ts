import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = path.resolve(__dirname, "../../..");

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, "../preview-out"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(repoRoot, "src/web"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4446,
    fs: {
      allow: [repoRoot],
    },
  },
});
