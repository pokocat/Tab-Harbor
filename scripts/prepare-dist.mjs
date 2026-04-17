import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = resolve(rootDir, "src");
const distDir = resolve(rootDir, "dist");

await mkdir(distDir, { recursive: true });

for (const relativePath of [
  "manifest.json",
  "popup.html",
  "popup.css",
  "dashboard.html",
  "dashboard.css"
]) {
  await cp(resolve(srcDir, relativePath), resolve(distDir, relativePath));
}

await cp(resolve(srcDir, "_locales"), resolve(distDir, "_locales"), { recursive: true });
await cp(resolve(srcDir, "icons"), resolve(distDir, "icons"), { recursive: true });
