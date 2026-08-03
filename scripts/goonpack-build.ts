// Zips each goonpacks/<dir>/ into goonpacks/<dir>.zip (see the naming note
// where the file is written).
//
//   npm run goonpack:build                  every pack source
//   npm run goonpack:build goonpacks/elise  just that one
//
//   npm run goonpack:build goonpacks/elise 2026-08-02-baseline
//     that pack from that experiment's descriptions rather than the
//     stock ones — pack-contents.ts says what ships either way.
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
  parsePack,
  type ParsedPack,
  type PackTree,
} from '../src/lib/goonpacks/pack';
import { captionWarning, strayWarning } from './lib/goonpack-report';
import { packContents } from '../src/inference/pack-contents';
import { progress } from './lib/progress';
import { collectPackFiles } from '../src/inference/pack-source';
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

// The pack directory then the experiment, both positional and both optional —
// the same two arguments in the same order as `experiment:run`, so the pair a
// run was made with is the pair a build is made from. A flag would need npm's
// own `--` in front of it to survive `npm run`.
const [named, experiment] = process.argv.slice(2);

// One pack source directory was named on the command line, rather than the
// whole of goonpacks/. It also makes a named source with no manifest.json an
// error rather than a skip, since the argument asked for that one by name.
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
// Media across every pack built, which is what shipped rather than what the
// directories hold — a picture with no sidecar is left out.
let shippedMedia = 0;
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
  // What will ship, rather than what the directory holds: a pack source keeps
  // an experiment's working files beside the media, and none of them belong in
  // the zip (pack-contents.ts).
  const {
    files: shipped,
    undescribed,
    strays,
  } = packContents(await collectPackFiles(dir), experiment);
  const from = new Map(shipped.map((f) => [f.entry, f.source]));
  // Those files as a PackTree — the same name-level validation the app runs
  // over an extracted tree, so a pack that builds is a pack that imports, and
  // what is validated is exactly what goes in.
  const tree: PackTree = {
    names: shipped.map((f) => f.entry),
    readText: (path) =>
      Promise.resolve(readFileSync(join(dir, from.get(path) ?? path), 'utf8')),
  };
  // One counter for all three passes: it rewrites a single line, and is wiped
  // before anything is printed so a status line never lands mid-count.
  const counter = progress();
  let parsed: ParsedPack;
  try {
    parsed = await parsePack(tree, {
      checked: (done, total) => counter.step('checking names', done, total),
      read: (done, total) => counter.step('reading sidecars', done, total),
    });
  } catch (e) {
    counter.clear();
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
  await writeZip(dir, shipped, out, (done, total) =>
    counter.step('zipping', done, total),
  );
  counter.clear();
  const counts = describeMedia(countMedia(parsed.media));
  shippedMedia += parsed.media.length;
  console.log(green(`${name}: 0 errors`));
  console.log(`  built, ${name}.zip${counts === '' ? '' : `, ${counts}`}`);
  // What the author probably didn't mean: pictures still waiting for a sidecar,
  // which were left out rather than shipped undescribed, and names under media/
  // that nothing will play.
  const captions = captionWarning(undescribed);
  if (captions !== null) console.warn(yellow(`  warning: ${captions}`));
  const stray = strayWarning(strays);
  if (stray !== null) console.warn(yellow(`  warning: ${stray}`));
  built++;
}
console.log(`  ${built} pack(s) built, ${shippedMedia} media`);
