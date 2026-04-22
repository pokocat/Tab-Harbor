import { cp, mkdir, stat } from "node:fs/promises";
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

for (const assetDir of ["img"]) {
  const source = resolve(srcDir, assetDir);
  try {
    const details = await stat(source);
    if (details.isDirectory()) {
      await cp(source, resolve(distDir, assetDir), { recursive: true });
    }
  } catch {
    // Skip optional asset directories that are not present in this workspace.
  }
}
