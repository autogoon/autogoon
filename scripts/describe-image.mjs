// Describe an image with a vision model and write the caption to a sidecar
// <basename>.txt — the exact file scripts/generate-companion-pictures.mjs globs
// into a companion's pictures. So the flow is: drop an image in
// public/companions/<id>/, run `npm run describe <path>`, then it's picked up on
// the next dev/build.
//
//   npm run describe public/companions/aimee/whatever.jpg
//
// Uses Qwen3-VL on OpenRouter by default; override with DESCRIBE_MODEL. Reads
// OPENROUTER_API_KEY (and LLM_URL) from the environment — the npm script loads
// .env via --env-file-if-exists, so the same key the app uses just works. The
// image is downscaled (long edge 1024px, JPEG q80) with macOS `sips` before
// sending, so this script is macOS-only.
//
// describeImage() and sidecarPath() are exported so describe-missing.mjs can
// reuse them; the CLI below runs only when this file is the entry point.
//
// Strong vision models on OpenRouter (set DESCRIBE_MODEL to one of these) —
// verify the exact slug + pricing at https://openrouter.ai/models (filter
// Input modality → Image); the catalogue shifts over time:
//
//   Best quality / most detailed:
//     Gemini 2.5 Pro           google/gemini-2.5-pro
//     Claude Opus 4.8          anthropic/claude-opus-4.8
//     Claude Sonnet 4.5        anthropic/claude-sonnet-4.5
//     GPT-4.1                  openai/gpt-4.1
//     GPT-4o                   openai/gpt-4o
//     Qwen3-VL 235B            qwen/qwen3-vl-235b-a22b-instruct  (strongest open-weight; the default below)
//     Qwen2.5-VL 72B           qwen/qwen2.5-vl-72b-instruct
//
//   Cheap, good for bulk captioning (describe:missing over a whole folder):
//     Gemini 2.5 Flash         google/gemini-2.5-flash
//     Gemini 2.5 Flash Lite    google/gemini-2.5-flash-lite
//     Qwen3-VL 32B             qwen/qwen3-vl-32b-instruct
//     Qwen3-VL 30B A3B         qwen/qwen3-vl-30b-a3b-instruct
//     Qwen3-VL 8B              qwen/qwen3-vl-8b-instruct

import process from 'node:process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { basename, extname, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

// Before sending, the image is downscaled to a JPEG with its long edge at most
// this many pixels — plenty for a reliable description and a fraction of the
// upload of a full-res original (the models downscale internally anyway).
const MAX_EDGE = 1024;
const JPEG_QUALITY = 80;

// Downscale an image to a temp JPEG (long edge MAX_EDGE, quality JPEG_QUALITY)
// and return its bytes; the caller deletes nothing — this cleans up its own temp
// file. Uses macOS `sips` (built in), so this script is macOS-only.
function resizedJpeg(imagePath) {
  const tmp = join(tmpdir(), `describe-${randomUUID()}.jpg`);
  try {
    execFileSync(
      'sips',
      [
        '-Z',
        String(MAX_EDGE),
        '-s',
        'format',
        'jpeg',
        '-s',
        'formatOptions',
        String(JPEG_QUALITY),
        imagePath,
        '--out',
        tmp,
      ],
      { stdio: 'ignore' },
    );
    return readFileSync(tmp);
  } catch (e) {
    throw new Error(
      `sips failed to resize ${imagePath} (this script needs macOS): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  } finally {
    rmSync(tmp, { force: true });
  }
}

// The house caption style — matches the existing sidecar descriptions so a
// freshly-described image reads like the rest of the set.
const PROMPT = `Write a single-line caption for this photo — it is pose/mood metadata
for a companion app that lets the user pick a picture that fits the moment.

Rules:
- One sentence, roughly 15–30 words, present tense, NO leading pronoun
- Start with the pose/action, and include the location and lighting.
- Cover: outfit / state of undress, specific colours of the clothing.
- Cover: specific pose and position, whether she is sitting facing away or towards the
  camera, what her hair is doing, gaze/expression, and the overall mood.
- Take extra care to describe the pose, especially if she's sitting/kneeling/lying down,
  and what her hands are doing.
- Take care of what uncovered body parts are visible, and how the clothing is arranged.
- Note if you can see for example, her back, thighs, nipples, pokies, pubic hair, or
  genitals, and if so, how much is visible.

Output ONLY the caption line — no quotes, no preamble, no extra text.`;

// The sidecar description path for an image: <basename>.txt beside it.
export function sidecarPath(imagePath) {
  return join(
    dirname(imagePath),
    `${basename(imagePath, extname(imagePath))}.txt`,
  );
}

// Describe one image with the vision model and return the one-line caption.
// Throws on any failure (unsupported type, missing key, API error, empty reply)
// so callers can decide how to report it.
export async function describeImage(imagePath) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    throw new Error('OPENROUTER_API_KEY is not set — put it in .env.');
  }
  const baseUrl = process.env.LLM_URL ?? 'https://openrouter.ai/api/v1';
  // Qwen3-VL 235B — the strongest open vision model on OpenRouter. Override with
  // DESCRIBE_MODEL to try another (see the list at the top of this file).
  const model =
    process.env.DESCRIBE_MODEL ?? 'qwen/qwen3-vl-235b-a22b-instruct';

  const ext = extname(imagePath).toLowerCase();
  if (MIME[ext] === undefined) {
    throw new Error(`Unsupported image type: ${ext || '(none)'}`);
  }
  // Always send a downscaled JPEG, whatever the source format.
  const dataUri = `data:image/jpeg;base64,${resizedJpeg(imagePath).toString(
    'base64',
  )}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:8931',
      'X-Title': 'autogoon describe-image',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Request failed: ${res.status} ${res.statusText}\n${await res.text()}`,
    );
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      `No caption was returned:\n${JSON.stringify(data, null, 2)}`,
    );
  }

  // Collapse to one line and strip any wrapping quotes the model may add.
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

// CLI: describe one image and write its sidecar. Runs only when invoked
// directly (not when imported by describe-missing.mjs).
async function main() {
  const imagePath = process.argv[2];
  if (imagePath === undefined || imagePath === '') {
    console.error('Usage: npm run describe <path-to-image>');
    process.exit(1);
  }
  try {
    const caption = await describeImage(imagePath);
    const outFile = sidecarPath(imagePath);
    writeFileSync(outFile, `${caption}\n`);
    console.log(`Wrote ${outFile}:\n${caption}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
