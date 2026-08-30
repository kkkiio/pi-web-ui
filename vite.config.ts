import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Keep the /ws proxy target aligned with the hub's own port resolution
// (src/hub/cli.ts: PI_WEB_UI_HUB_PORT > default 3001).
const hubPort = process.env.PI_WEB_UI_HUB_PORT || "3001";

export default defineConfig({
  root: "src/web",
  publicDir: "../../public",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/web"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4444,
    proxy: {
      "/ws": {
        target: `ws://127.0.0.1:${hubPort}`,
        ws: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4445,
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
