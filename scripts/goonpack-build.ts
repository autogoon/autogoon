// Zips each goonpacks/<dir>/ into goonpacks/<dir>.zip (see the naming note
// where the file is written).
//
//   npm run goonpack:build                  every pack source
//   npm run goonpack:build goonpacks/elise  just that one
//
// (runs under tsx, so it imports the app's validator directly: every pack
// source passes parsePack — the same checks importing runs — before it is
// zipped, or the build fails. Only the app-level cross-pack checks, like "is
// the base installed", can't run here.)
import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { countMedia, describeMedia } from '../src/lib/goonpacks/entries';
import { PackError } from '../src/lib/goonpacks/manifest';
import {
  MEDIA_DIR,
  parsePack,
  type ParsedPack,
  type PackTree,
} from '../src/lib/goonpacks/pack';
import { SIDECAR_EXT } from '../src/lib/goonpacks/sidecar';
import { captionWarning } from './lib/goonpack-report';
import { collectPackFiles } from './lib/goonpack-source';
import { writeZip } from './lib/goonpack-zip';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = join(root, 'goonpacks');

// Per-pack status lines: green for a clean build, yellow for a warning, red for
// errors. Plain when piped.
const green = (s: string): string =>
  process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red = (s: string): string =>
  process.stderr.isTTY ? `\x1b[31m${s}\x1b[0m` : s;
const yellow = (s: string): string =>
  process.stderr.isTTY ? `\x1b[33m${s}\x1b[0m` : s;

// One pack source directory was named on the command line, rather than the
// whole of goonpacks/. It also makes a named source with no manifest.json an
// error rather than a skip, since the argument asked for that one by name.
const named = process.argv[2];
const explicit = named !== undefined && named !== '';

function sourcesToBuild(): string[] {
  if (explicit) {
    const dir = resolve(named);
    try {
      if (!statSync(dir).isDirectory()) throw new Error('not a directory');
    } catch {
      console.error(`${named} isn't a directory`);
      process.exit(1);
    }
    return [dir];
  }
  let entries: Dirent[];
  try {
    entries = readdirSync(packsDir, { withFileTypes: true });
  } catch {
    console.error(
      'no goonpacks/ directory — put pack sources in goonpacks/<dir>/',
    );
    process.exit(1);
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => join(packsDir, e.name));
}

let built = 0;
for (const dir of sourcesToBuild()) {
  const name = basename(dir);
  // A directory without a manifest isn't a pack source — name it and skip;
  // everything else is parsePack's to judge.
  try {
    statSync(join(dir, 'manifest.json'));
  } catch {
    if (explicit) {
      console.error(`${named}: no manifest.json — not a pack source`);
      process.exit(1);
    }
    console.warn(`skipping ${name}: no manifest.json`);
    continue;
  }
  const names = collectPackFiles(dir);
  // The pack source as a PackTree — the same name-level validation the app runs
  // over an extracted tree, so a pack that builds is a pack that imports.
  const tree: PackTree = {
    names,
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
    console.error(red(`${name}: ${n} error${n === 1 ? '' : 's'}`));
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
    continue; // invalid — don't write a zip that can't import
  }
  // The zip is named after the source directory, not the pack id — two
  // directories can hold two versions of the same id without clobbering — and
  // sits beside that directory, wherever it was given from.
  const out = join(dirname(dir), `${name}.zip`);
  await writeZip(dir, names, out);
  const counts = describeMedia(countMedia(parsed.media));
  console.log(green(`${name}: 0 errors`));
  console.log(`  built, ${name}.zip${counts === '' ? '' : `, ${counts}`}`);
  // Which files are still waiting for a sidecar, by subtraction rather than by
  // re-deciding anything: parsePack accepted the tree, so every non-sidecar
  // file under media/ is a supported one, and the ones it didn't return as
  // media are exactly those with no sidecar yet.
  const described = new Set(parsed.media.map((m) => m.file));
  const captions = captionWarning(
    tree.names
      .filter((p) => p.startsWith(MEDIA_DIR))
      .map((p) => p.slice(MEDIA_DIR.length))
      .filter((f) => !f.endsWith(`.${SIDECAR_EXT}`) && !described.has(f)),
  );
  if (captions !== null) console.warn(yellow(`  warning: ${captions}`));
  built++;
}
console.log(`${built} pack(s) built`);
