import { resolve } from "node:path";
import { build } from "vite";

const projectRoot = resolve(import.meta.dirname, "..");
const outDir = resolve(projectRoot, "dist");

async function buildEntry({ entry, fileName, format }) {
  await build({
    configFile: false,
    root: projectRoot,
    publicDir: false,
    logLevel: "warn",
    build: {
      outDir,
      emptyOutDir: false,
      target: "chrome116",
      minify: true,
      rollupOptions: {
        input: resolve(projectRoot, entry),
        output: {
          format,
          entryFileNames: fileName,
          codeSplitting: false,
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  });
}

await buildEntry({
  entry: "src/background/index.ts",
  fileName: "background.js",
  format: "es",
});

await buildEntry({
  entry: "src/content/index.ts",
  fileName: "content.js",
  format: "iife",
});
