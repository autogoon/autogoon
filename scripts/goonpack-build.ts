// Zips each goonpacks/<dir>/ into goonpacks/<dir>.zip (see the naming note
// where the file is written). Run: npm run goonpack:build
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
import { countMedia, describeMedia } from '../src/lib/goonpacks/entries';
import { PackError } from '../src/lib/goonpacks/manifest';
import {
  parsePack,
  type ParsedPack,
  type PackTree,
} from '../src/lib/goonpacks/pack';
import { captionWarning } from './lib/goonpack-report';
import { collectPackFiles } from './lib/goonpack-source';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = join(root, 'goonpacks');

// Per-pack status lines: green for a clean build, red for errors. Plain when
// piped.
const green = (s: string): string =>
  process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red = (s: string): string =>
  process.stderr.isTTY ? `\x1b[31m${s}\x1b[0m` : s;
const yellow = (s: string): string =>
  process.stderr.isTTY ? `\x1b[33m${s}\x1b[0m` : s;

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
  const files = collectPackFiles(dir);
  // The pack source as a PackTree — the same name-level validation the app runs
  // over an extracted tree, so a pack that builds is a pack that imports.
  const tree: PackTree = {
    names: Object.keys(files),
    readText: (path) => Promise.resolve(readFileSync(join(dir, path), 'utf8')),
  };
  let parsed: ParsedPack;
  try {
    parsed = await parsePack(tree);
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
  // Deflated, like the `zip -r` an author would run. Stills and video barely
  // shrink, but a pack's text does, and that is the part that grows.
  writeFileSync(out, zipSync(files));
  const counts = describeMedia(countMedia(parsed.media));
  console.log(green(`${entry.name}: 0 errors`));
  console.log(
    `  built, ${entry.name}.zip${counts === '' ? '' : `, ${counts}`}`,
  );
  const captions = captionWarning(parsed.media);
  if (captions !== null) console.warn(yellow(`  warning: ${captions}`));
  built++;
}
console.log(`${built} pack(s) built`);
