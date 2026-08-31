import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@server": path.resolve(import.meta.dirname, "server"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  ssr: {
    // Bundle the complete application graph into the function artifact. Keep
    // the native SQLite package external so its verified Linux binary loads
    // from app/node_modules at runtime.
    noExternal: true,
    external: ["better-sqlite3", "vite"],
  },
  build: {
    ssr: path.resolve(import.meta.dirname, "server/vercel.ts"),
    outDir: path.resolve(import.meta.dirname, "dist/server"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "vercel.mjs",
        chunkFileNames: "chunks/[name]-[hash].mjs",
      },
    },
  },
});
