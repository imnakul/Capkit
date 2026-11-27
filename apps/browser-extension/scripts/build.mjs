// Builds the extension: three single-file IIFE scripts plus the React popup.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");
const require = createRequire(import.meta.url);

const scripts = [
  { name: "background", entry: "src/background.ts", file: "background.js" },
  { name: "capkitIsolated", entry: "src/content/isolated.ts", file: "content/isolated.js" },
  { name: "capkitMainWorld", entry: "src/content/main-world.ts", file: "content/main-world.js" },
];

let first = true;
for (const script of scripts) {
  await build({
    root,
    configFile: false,
    logLevel: "warn",
    publicDir: first ? resolve(root, "public") : false,
    build: {
      outDir: dist,
      emptyOutDir: first,
      watch: watch ? {} : null,
      minify: true,
      sourcemap: false,
      lib: { entry: resolve(root, script.entry), name: script.name, formats: ["iife"], fileName: () => script.file },
    },
  });
  first = false;
}

await build({
  root: resolve(root, "src/popup"),
  base: "./",
  configFile: false,
  logLevel: "warn",
  plugins: [react(), tailwind()],
  build: { outDir: resolve(dist, "popup"), emptyOutDir: true, watch: watch ? {} : null },
});

await mkdir(resolve(dist, "fonts"), { recursive: true });
for (const pkg of ["geist", "geist-mono"]) {
  const dir = resolve(dirname(require.resolve(`@fontsource-variable/${pkg}/package.json`)), "files");
  for (const file of await readdir(dir)) {
    if (file.endsWith("-latin-wght-normal.woff2")) await cp(resolve(dir, file), resolve(dist, "fonts", file));
  }
}

const rootVersion = JSON.parse(await readFile(resolve(root, "../../package.json"), "utf8")).version;
const manifestPath = resolve(dist, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.version = rootVersion;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`CapKit Inspector ${rootVersion} built to ${dist}`);
