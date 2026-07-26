// Zips each goonpacks/<dir>/ into goonpacks/<id>.zip — the id read from the
// pack's manifest, so directory names stay free. Run: npm run goonpack:build
// (runs under tsx, so it imports the app's validator directly: every pack
// source passes parsePack — the same checks importing runs — before it is
// zipped, or the build fails. Only the app-level cross-pack checks, like "is
// the base installed", can't run here.)
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  type Dirent,
} from 'node:fs';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { PackError } from '../src/lib/goonpacks/manifest';
import { isJunkPath } from '../src/lib/goonpacks/media';
import { parsePack, type PackTree } from '../src/lib/goonpacks/pack';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = join(root, 'goonpacks');

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
    'no goonpacks/ directory — put pack sources in goonpacks/<dir>/',
  );
  process.exit(1);
}

let built = 0;
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const dir = join(packsDir, entry.name);
  // A directory without a manifest isn't a pack source — skip it quietly;
  // everything else is parsePack's to judge.
  try {
    statSync(join(dir, 'manifest.json'));
  } catch {
    console.warn(`skipping ${entry.name}: no manifest.json`);
    continue;
  }
  const files: Record<string, Uint8Array> = {};
  const add = (rel: string) => {
    files[rel] = new Uint8Array(readFileSync(join(dir, rel)));
  };
  add('manifest.json');
  try {
    statSync(join(dir, 'system-prompt.md'));
    add('system-prompt.md');
  } catch {
    /* overlays may have no prompt */
  }
  try {
    for (const f of readdirSync(join(dir, 'media')).sort()) {
      if (isJunkPath(f)) continue;
      add(join('media', f));
    }
  } catch {
    /* no media dir */
  }
  // The pack source as a PackTree — the same name-level validation the app runs
  // over an extracted tree, so a pack that builds is a pack that imports.
  const tree: PackTree = {
    names: Object.keys(files),
    readText: (path) => Promise.resolve(readFileSync(join(dir, path), 'utf8')),
  };
  try {
    // Only media/ is zipped, so a source still holding pictures/ would build
    // into a pack with no media at all — and validate, since the zip has no
    // pictures/ folder for the format gate to catch. Refuse it here instead.
    if (
      statSync(join(dir, 'pictures'), {
        throwIfNoEntry: false,
      })?.isDirectory() === true
    ) {
      throw new PackError(
        'This pack source still has a pictures/ folder — rename it to media/.',
      );
    }
    await parsePack(tree);
  } catch (e) {
    const problems =
      e instanceof PackError
        ? e.problems
        : [e instanceof Error ? e.message : String(e)];
    const n = problems.length;
    console.error(red(`${entry.name}: ${n} error${n === 1 ? '' : 's'}`));
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
    continue; // invalid — don't write a zip that can't import
  }
  // The zip is named after the source directory, not the pack id — two
  // directories can hold two versions of the same id without clobbering.
  const out = join(packsDir, `${entry.name}.zip`);
  writeFileSync(out, zipSync(files, { level: 0 })); // jpegs don't recompress
  console.log(green(`${entry.name}: 0 errors`));
  console.log(`  built, ${entry.name}.zip`);
  built++;
}
console.log(`${built} pack(s) built`);
