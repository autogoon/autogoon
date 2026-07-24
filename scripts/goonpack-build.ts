// Zips each goonpacks/<dir>/ into goonpacks/<id>.zip — the id read from the
// pack's manifest, so directory names stay free. Run: npm run goonpack:build
// (runs under tsx, so it imports the app's importer directly: every built
// zip passes parsePack — the same checks importing runs — or the build
// fails. Only the app-level cross-pack checks, like "is the base
// installed", can't run here.)
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { join, dirname } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { PackError } from "../src/lib/goonpacks/manifest";
import { parsePack } from "../src/lib/goonpacks/pack";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = join(root, "goonpacks");

// Per-pack status lines: green for a clean build, red for errors. Plain when
// piped.
const green = (s: string): string =>
  process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red = (s: string): string =>
  process.stderr.isTTY ? `\x1b[31m${s}\x1b[0m` : s;

let entries: Dirent[];
try {
  entries = readdirSync(packsDir, { withFileTypes: true });
} catch {
  console.error(
    "no goonpacks/ directory — put pack sources in goonpacks/<dir>/",
  );
  process.exit(1);
}

let built = 0;
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const dir = join(packsDir, entry.name);
  // Only enough manifest reading to name the output zip — parsePack below is
  // the actual judge of the manifest.
  let manifest: Record<string, unknown>;
  try {
    const raw: unknown = JSON.parse(
      readFileSync(join(dir, "manifest.json"), "utf8"),
    );
    if (typeof raw !== "object" || raw === null) throw new Error("not JSON");
    manifest = raw as Record<string, unknown>;
  } catch {
    console.warn(`skipping ${entry.name}: no readable manifest.json`);
    continue;
  }
  const id = manifest.id;
  if (typeof id !== "string" || id === "") {
    console.warn(`skipping ${entry.name}: manifest has no id`);
    continue;
  }
  const files: Record<string, Uint8Array> = {};
  const add = (rel: string) => {
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
  const zip = zipSync(files, { level: 0 }); // jpegs don't recompress
  try {
    parsePack(zip);
  } catch (e) {
    const problems =
      e instanceof PackError
        ? e.problems
        : [e instanceof Error ? e.message : String(e)];
    const n = problems.length;
    console.error(red(`${entry.name}: ${n} error${n === 1 ? "" : "s"}`));
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
    continue; // invalid — don't write a zip that can't import
  }
  const out = join(packsDir, `${id}.zip`);
  writeFileSync(out, zip);
  console.log(green(`${entry.name}: 0 errors`));
  console.log(`  built, ${id}.zip`);
  built++;
}
console.log(`${built} pack(s) built`);
