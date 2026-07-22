// Describe an image with a vision model and write the caption to a sidecar
// <basename>.txt — the exact file scripts/generate-companion-pictures.mjs globs
// into a companion's pictures. So the flow is: drop an image in
// public/companions/<id>/, run `npm run describe <path>`, then it's picked up on
// the next dev/build.
//
//   npm run describe public/companions/aimee/whatever.jpg
//
// Uses Qwen2.5-VL on OpenRouter by default; override with DESCRIBE_MODEL. Reads
// OPENROUTER_API_KEY (and LLM_URL) from the environment — the npm script loads
// .env via --env-file-if-exists, so the same key the app uses just works.

import process from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname, dirname, join } from "node:path";

const imagePath = process.argv[2];
if (imagePath === undefined || imagePath === "") {
  console.error("Usage: npm run describe <path-to-image>");
  process.exit(1);
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (apiKey === undefined || apiKey === "") {
  console.error("OPENROUTER_API_KEY is not set — put it in .env.");
  process.exit(1);
}

const baseUrl = process.env.LLM_URL ?? "https://openrouter.ai/api/v1";
// Qwen2.5-VL 72B — a strong open vision model on OpenRouter. Override with
// DESCRIBE_MODEL to try another (e.g. google/gemini-2.5-flash for cheap bulk).
const model = process.env.DESCRIBE_MODEL ?? "qwen/qwen-2.5-vl-72b-instruct";

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};
const ext = extname(imagePath).toLowerCase();
const mime = MIME[ext];
if (mime === undefined) {
  console.error(`Unsupported image type: ${ext || "(none)"}`);
  process.exit(1);
}

// The house caption style — matches the existing sidecar descriptions so a
// freshly-described image reads like the rest of the set.
const PROMPT = `Write a single-line caption for this photo — it is pose/mood metadata for a companion app that lets the user pick a picture that fits the moment.

Rules:
- One sentence, roughly 15–30 words, present tense, NO leading pronoun (start with the pose/action, e.g. "Kneeling up on the bed…").
- Cover: outfit / state of undress, pose and position, what her hair is doing, gaze/expression, and the overall mood.
- A clean, tasteful, specific caption — descriptive, not crude.

Example of the exact style:
Sitting back on the bed propped on one arm in a white lace bra and matching lace panties, long auburn hair loose over one shoulder, glancing away — soft and coy.

Output ONLY the caption line — no quotes, no preamble, no extra text.`;

const dataUri = `data:${mime};base64,${readFileSync(imagePath).toString("base64")}`;

const res = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "http://localhost:8931",
    "X-Title": "autogoon describe-image",
  },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
  }),
});

if (!res.ok) {
  console.error(`Request failed: ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

const data = await res.json();
const raw = data?.choices?.[0]?.message?.content;
if (typeof raw !== "string" || raw.trim() === "") {
  console.error("No caption was returned:");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

// Collapse to one line and strip any wrapping quotes the model may add.
const caption = raw
  .replace(/\s+/g, " ")
  .trim()
  .replace(/^["']|["']$/g, "")
  .trim();

const outFile = join(dirname(imagePath), `${basename(imagePath, ext)}.txt`);
writeFileSync(outFile, `${caption}\n`);
console.log(`Wrote ${outFile}:\n${caption}`);
