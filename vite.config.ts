import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  worker: {
    format: "es",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome116",
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, "popup.html"),
        workspace: resolve(import.meta.dirname, "workspace.html"),
        devtools: resolve(import.meta.dirname, "devtools.html"),
        panel: resolve(import.meta.dirname, "panel.html"),
      },
    },
  },
});
