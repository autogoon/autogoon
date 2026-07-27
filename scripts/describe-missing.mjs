// Describe every goonpack image that doesn't have a description yet.
//
//   npm run goonpack:describe-missing
//
// Scans goonpacks/<dir>/media/ for stills whose sidecar <basename>.md is
// missing or empty, and describes each one (writing the .md) via the same
// describeImage() the single-image `npm run goonpack:describe` uses. Videos are
// left alone — their sidecars are hand-written — as are stills that already
// have one, so it's safe to re-run after dropping in more. Reads
// OPENROUTER_API_KEY / LLM_URL from the environment (the npm script loads .env
// via --env-file-if-exists), and
// honours MODEL the same as `npm run goonpack:describe`, so you can pick the
// model for a bulk run:
//
//   MODEL=google/gemini-2.5-flash npm run goonpack:describe-missing

import process from 'node:process';
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  describeImage,
  sidecarPath,
  renderSidecar,
  inlineImage,
  green,
  yellow,
  dim,
} from './describe-image.mjs';

// The pack format's still types only. Videos are skipped: their captions are
// hand-written.
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const goonpacksDir = join(root, 'goonpacks');

// Every goonpack image with no (non-empty) sidecar yet, sorted.
function missingImages() {
  const out = [];
  if (!existsSync(goonpacksDir)) return out;
  for (const entry of readdirSync(goonpacksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(goonpacksDir, entry.name, 'media');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!IMAGE_RE.test(file)) continue;
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
  console.log('All goonpack images already have descriptions.');
  process.exit(0);
}

console.log(`Describing ${images.length} image(s) without a description…\n`);

// Sequential — kinder to rate limits, and the output stays readable in order.
// Each picture narrates itself exactly as the single-image script does: the file
// in yellow, each step as it starts, what the model observed, the caption in
// green, then the picture itself to check it against — so a long bulk run can be
// watched going past.
let described = 0;
let failed = 0;
for (const image of images) {
  console.log(yellow(image));
  try {
    let picture = '';
    const { caption, observations } = await describeImage(image, {
      onStep: (s) => console.log(dim(s)),
      onImage: (b64) => {
        picture = inlineImage(b64);
      },
    });
    writeFileSync(sidecarPath(image), renderSidecar(caption, observations));
    console.log(dim(observations));
    console.log(green(caption));
    if (picture !== '') console.log(picture);
    console.log('');
    described += 1;
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}\n`);
    failed += 1;
  }
}

console.log(`Done: ${described} described, ${failed} failed.`);
if (failed > 0) process.exit(1);
