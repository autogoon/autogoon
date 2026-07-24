// Describe an image with a vision model and write the caption to a sidecar
// <basename>.txt — the description a goonpack carries beside each picture. So
// the flow is: drop an image in goonpacks/<dir>/pictures/, run
// `npm run goonpack:describe <path>`, then `npm run goonpack:build` bundles it
// into the pack.
//
//   npm run goonpack:describe goonpacks/aimee/pictures/whatever.jpg
//
// (npm runs the script from the repo root, so the path is relative to there,
// not to your shell's directory.)
//
// Uses Qwen3-VL on OpenRouter by default; override with MODEL. Reads
// OPENROUTER_API_KEY (and LLM_URL) from the environment — the npm script loads
// .env via --env-file-if-exists, so the same key the app uses just works. The
// image is downscaled (long edge 1024px, JPEG q80) with macOS `sips` before
// sending, so this script is macOS-only.
//
// The model is asked to observe the picture out loud before condensing to the
// caption line (see PROMPT); only the caption reaches the sidecar, but both
// scripts print the observations so you can see what it based the caption on.
//
// describeImage(), sidecarPath() and the colour helpers are exported so
// describe-missing.mjs can reuse them; the CLI below runs only when this file is
// the entry point.
//
// Strong vision models on OpenRouter (set MODEL to one of these) —
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
//   Cheap, good for bulk captioning (goonpack:describe-missing over a whole folder):
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
//
// Two-step on purpose: the model observes out loud first, then condenses. Asking
// for the caption alone forbids the reasoning that rescues an ambiguous pose —
// so the observations are scratch space, parsed off and thrown away (only the
// CAPTION line reaches the sidecar). The confusable poses get explicit
// discriminators rather than "take care", because that is the part a model gets
// wrong by guessing from overall impression instead of looking at the legs.
const PROMPT = `This photo is pose/mood metadata for a companion app: she reads the
caption to pick a picture that fits the moment, so it has to be accurate about pose
and state of undress, not just evocative.

Work in two steps.

STEP 1 — OBSERVATIONS. Answer each of these on its own line, briefly. Look before
you decide. If something is genuinely ambiguous, say so instead of guessing.
- Support: what is her weight resting on — feet, buttocks, shins/knees, hip, back,
  front, hands?
- Legs: where are the knees, and where are the heels and shins?
- Sitting vs kneeling vs squatting — decide from the support, and say which and why:
  sitting = buttocks on the surface; kneeling = shins/knees on the surface, buttocks
  off it or resting on the heels; squatting = weight on the feet, buttocks unsupported.
- If lying: on her front, back or side? Which end of her is nearest the camera?
- Facing: towards camera / away / profile / three-quarters. Is her torso square to
  the camera or turned, and which way is her head turned?
- Hands: where is each one and what is it doing or touching?
- Clothing: each garment, its specific colour, and how it is arranged — pushed up,
  pulled aside, half off, straps down, unfastened.  Mention topless if there is no
  bra or top.
- Exposed: which parts are bare and how much is actually visible — back,
  nipples (or nipples showing through fabric), stomach, thighs, buttocks,
  genitals. Grade each one "fully", "partly", "faintly" (made out through fabric or
  in shadow) or "not at all". Never write "not clearly" or similar — if you can make
  it out at all, however faintly, that is "faintly", not "not at all".
- Setting, and the quality and direction of the light.
- Hair: what it is doing — loose or tied, where it falls, whether she is holding,
  lifting or pushing it.
- Gaze direction, expression, overall mood.

STEP 2 — CAPTION. Condense the observations into ONE sentence of roughly 30–40 words,
present tense, no leading pronoun, covering all of these in this order — none of them
is optional:
- the pose,
- the setting and the light,
- the clothing: the garments, their colours, and how they are arranged,
- what is bare or showing, and how much — include anything showing even faintly,
  such as nipples through fabric,
- what her hair is doing,
- which way she is looking.
Carry the grades from your observations exactly: never merge two parts you graded
differently, and never soften a grade. Nipples are always stated separately from
breasts. Say only what IS visible: never state that something is covered, hidden or not
visible — leaving it out says that. Leave mood and expression out altogether. State only
what you concluded above — drop anything you flagged as uncertain rather than hedging.

Reply in exactly this format, with nothing after the caption line:

OBSERVATIONS:
<your lines>

CAPTION: <the single caption sentence>`;

// Output colours, shared with describe-missing.mjs: green names the image,
// yellow the caption it ended up with, and the observations in between are left
// plain. Colour only on a TTY, so piped output stays clean.
export const green = (s) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s);
export const yellow = (s) => (process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s);

// The sidecar description path for an image: <basename>.txt beside it.
export function sidecarPath(imagePath) {
  return join(
    dirname(imagePath),
    `${basename(imagePath, extname(imagePath))}.txt`,
  );
}

// Describe one image with the vision model. Returns `{ caption, observations }`:
// the one-line caption for the sidecar, and the model's scratch observations
// (`""` if it skipped them) for a human to eyeball — only the caption is ever
// written to disk. Throws on any failure (unsupported type, missing key, API
// error, empty or unusable reply) so callers can decide how to report it.
export async function describeImage(imagePath) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    throw new Error('OPENROUTER_API_KEY is not set — put it in .env.');
  }
  const baseUrl = process.env.LLM_URL ?? 'https://openrouter.ai/api/v1';
  // Qwen3-VL 235B — the strongest open vision model on OpenRouter. Override with
  // MODEL to try another (see the list at the top of this file).
  const model = process.env.MODEL ?? 'qwen/qwen3-vl-235b-a22b-instruct';

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
      // Deterministic, so re-running the same image compares prompts and models
      // rather than sampling luck.
      temperature: 0,
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

  // Split the two-step reply. The last CAPTION: line wins (the model sometimes
  // echoes the format template first); everything before it is the scratch
  // observations. A model that ignored the format still gets read — its last
  // non-empty line is the caption, since the caption comes last either way.
  const reply = raw.trim();
  const marked = [...reply.matchAll(/^[ \t]*CAPTION:[ \t]*(.+)$/gim)];
  let caption;
  let observations;
  if (marked.length > 0) {
    const last = marked[marked.length - 1];
    caption = last[1];
    observations = reply
      .slice(0, last.index)
      .replace(/^\s*OBSERVATIONS:[ \t]*/i, '')
      .trim();
  } else {
    const lines = reply.split('\n').map((l) => l.trim());
    const nonEmpty = lines.filter((l) => l !== '');
    caption = nonEmpty[nonEmpty.length - 1];
    observations = nonEmpty.slice(0, -1).join('\n');
  }

  // Collapse to one line and strip any wrapping quotes the model may add.
  caption = caption
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  if (caption === '') {
    throw new Error(`No caption could be read from the reply:\n${reply}`);
  }

  return { caption, observations };
}

// CLI: describe one image and write its sidecar. Runs only when invoked
// directly (not when imported by describe-missing.mjs). This is the
// one-picture inspection tool, so it prints the model's observations alongside
// the caption — that's how you tell a better prompt from a luckier one.
async function main() {
  const imagePath = process.argv[2];
  if (imagePath === undefined || imagePath === '') {
    console.error('Usage: npm run goonpack:describe <path-to-image>');
    process.exit(1);
  }
  try {
    const { caption, observations } = await describeImage(imagePath);
    writeFileSync(sidecarPath(imagePath), `${caption}\n`);
    console.log(green(basename(imagePath)));
    if (observations !== '') console.log(`${observations}\n`);
    console.log(yellow(caption));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
