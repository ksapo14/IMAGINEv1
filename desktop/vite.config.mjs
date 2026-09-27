import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: desktopRoot,
  plugins: [react()],
  publicDir: false,
  server: { fs: { allow: [resolve(desktopRoot, "..")] } },
  build: { outDir: resolve(desktopRoot, "dist"), emptyOutDir: true }
});
