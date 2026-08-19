// Describe every goonpack image that doesn't have a description yet.
//
//   npm run goonpack:describe-missing                  every pack source
//   npm run goonpack:describe-missing goonpacks/elise  just that one
//
// Scans goonpacks/<dir>/media/ for stills whose sidecar <basename>.md is
// missing or empty, and describes each one (writing the .md) via the same
// describeImage() the single-image `npm run goonpack:describe` uses, in random
// order. A run stopped part-way through covers a spread of the pack rather
// than whatever sorts first. Videos are left alone — their sidecars are
// hand-written — as are stills that already have one. It's safe to re-run
// after dropping in more. Reads
// OPENROUTER_API_KEY / LLM_URL from the environment (the npm script loads .env
// via --env-file-if-exists), and
// honours MODEL the same as `npm run goonpack:describe`. You can pick the
// model for a bulk run:
//
//   MODEL=google/gemini-2.5-flash npm run goonpack:describe-missing

import process from 'node:process';
import {
  readdirSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_TYPES } from '../src/lib/goonpacks/media';
import { renderSidecar } from '../src/lib/goonpacks/sidecar';
import {
  describeImage,
  sidecarPath,
  inlineImage,
  green,
  yellow,
  dim,
} from './describe-image';

// The stills MEDIA_TYPES lists. Videos are skipped: their captions are
// hand-written.
const isImage = (file: string): boolean =>
  MEDIA_TYPES[extname(file).slice(1).toLowerCase()]?.kind === 'image';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const goonpacksDir = join(root, 'goonpacks');

// One pack source named on the command line, or every directory under
// goonpacks/. A named source that isn't there is an error, since the argument
// asked for that one by name.
const named = process.argv[2];
const explicit = named !== undefined && named !== '';

function packDirs(): string[] {
  if (explicit) {
    const dir = resolve(named);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      console.error(`${named} isn't a directory`);
      process.exit(1);
    }
    return [dir];
  }
  if (!existsSync(goonpacksDir)) return [];
  return readdirSync(goonpacksDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(goonpacksDir, e.name));
}

// Filename order is not a random sample of a pack. Describing in it would
// leave a run stopped part-way biased toward whatever sorts first. Shuffled
// per pack directory, which leaves the packs themselves in order.
const shuffled = (files: string[]): string[] =>
  files
    .map((file) => ({ file, at: Math.random() }))
    .sort((a, b) => a.at - b.at)
    .map((e) => e.file);

// Every goonpack image with no (non-empty) sidecar yet.
function missingImages(): string[] {
  const out: string[] = [];
  for (const packDir of packDirs()) {
    const dir = join(packDir, 'media');
    if (!existsSync(dir)) {
      // Named on the command line. Say so rather than reporting nothing to
      // do; a pack without media/ among all of them is just skipped.
      if (explicit) {
        console.error(`${named}: no media/ folder`);
        process.exit(1);
      }
      continue;
    }
    for (const file of shuffled(readdirSync(dir))) {
      if (!isImage(file)) continue;
      const image = join(dir, file);
      const sidecar = sidecarPath(image);
      const described =
        existsSync(sidecar) && readFileSync(sidecar, 'utf8').trim() !== '';
      if (!described) out.push(image);
    }
  }
  return out;
}

const images = missingImages();
if (images.length === 0) {
  console.log(
    explicit
      ? `Every image in ${named} already has a sidecar.`
      : 'Every goonpack image already has a sidecar.',
  );
  process.exit(0);
}

console.log(`Describing ${images.length} image(s) with no sidecar…\n`);

// Sequential — one request at a time stays under the rate limits, and the
// output stays readable in order. Each picture is reported exactly as the
// single-image script reports it — the file in yellow, each step as it starts,
// what the model observed, the caption in green, then the picture itself to
// check it against. A long bulk run can be watched going past.
let done = 0;
let failed = 0;
for (const image of images) {
  console.log(yellow(image));
  try {
    let picture = '';
    const described = await describeImage(image, {
      onStep: (s) => console.log(dim(s)),
      onImage: (b64) => {
        picture = inlineImage(b64);
      },
    });
    writeFileSync(sidecarPath(image), renderSidecar(described));
    console.log(dim(described.description));
    console.log(green(described.caption));
    if (picture !== '') console.log(picture);
    console.log('');
    done += 1;
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}\n`);
    failed += 1;
  }
}

console.log(`Done: ${done} described, ${failed} failed.`);
if (failed > 0) process.exit(1);
