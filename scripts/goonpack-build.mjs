// Zips each goonpacks/<dir>/ into goonpacks/<id>.zip — the id read from the
// pack's manifest, so directory names stay free. Run: npm run goonpack:build
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = join(root, "goonpacks");

let built = 0;
for (const entry of readdirSync(packsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(packsDir, entry.name);
  const manifestPath = join(dir, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    console.warn(`skipping ${entry.name}: no readable manifest.json`);
    continue;
  }
  const files = {};
  const add = (rel) => {
    files[rel] = new Uint8Array(readFileSync(join(dir, rel)));
  };
  add("manifest.json");
  try {
    statSync(join(dir, "system-prompt.md"));
    add("system-prompt.md");
  } catch {
    /* overlays may have no prompt */
  }
  try {
    for (const f of readdirSync(join(dir, "pictures")).sort()) {
      if (f === ".DS_Store") continue;
      add(join("pictures", f));
    }
  } catch {
    /* no pictures dir */
  }
  const out = join(packsDir, `${manifest.id}.zip`);
  writeFileSync(out, zipSync(files, { level: 0 })); // jpegs don't recompress
  console.log(`${entry.name} → ${manifest.id}.zip`);
  built++;
}
console.log(`${built} pack(s) built`);
