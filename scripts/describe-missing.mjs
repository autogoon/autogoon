// Describe every companion image that doesn't have a description yet.
//
//   npm run describe:missing
//
// Scans public/companions/<id>/ for images whose sidecar <basename>.txt is
// missing or empty, and captions each one (writing the .txt) via the same
// describeImage() the single-image `npm run describe` uses. Images that already
// have a description are left untouched, so it's safe to re-run after dropping
// in more. Reads OPENROUTER_API_KEY / LLM_URL from the environment (the npm
// script loads .env via --env-file-if-exists), and honours DESCRIBE_MODEL the
// same as `npm run describe`, so you can pick the model for a bulk run:
//
//   DESCRIBE_MODEL=google/gemini-2.5-flash npm run describe:missing

import process from "node:process";
import { readdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describeImage, sidecarPath } from "./describe-image.mjs";

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const companionsDir = join(root, "public", "companions");

// Every companion image with no (non-empty) sidecar description yet, sorted.
function missingImages() {
  const out = [];
  if (!existsSync(companionsDir)) return out;
  for (const entry of readdirSync(companionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(companionsDir, entry.name);
    for (const file of readdirSync(dir).sort()) {
      if (!IMAGE_RE.test(file)) continue;
      const image = join(dir, file);
      const txt = sidecarPath(image);
      const described =
        existsSync(txt) && readFileSync(txt, "utf8").trim() !== "";
      if (!described) out.push(image);
    }
  }
  return out;
}

const images = missingImages();
if (images.length === 0) {
  console.log("All companion images already have descriptions.");
  process.exit(0);
}

console.log(`Describing ${images.length} image(s) without a description…\n`);

// Sequential — kinder to rate limits, and the output stays readable in order.
let described = 0;
let failed = 0;
for (const image of images) {
  try {
    const caption = await describeImage(image);
    writeFileSync(sidecarPath(image), `${caption}\n`);
    console.log(`✓ ${image}\n  ${caption}\n`);
    described += 1;
  } catch (e) {
    console.error(
      `✗ ${image}\n  ${e instanceof Error ? e.message : String(e)}\n`,
    );
    failed += 1;
  }
}

console.log(`Done: ${described} described, ${failed} failed.`);
if (failed > 0) process.exit(1);
