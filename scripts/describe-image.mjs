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
//
// describeImage() and sidecarPath() are exported so describe-missing.mjs can
// reuse them; the CLI below runs only when this file is the entry point.

import process from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

// The house caption style — matches the existing sidecar descriptions so a
// freshly-described image reads like the rest of the set.
const PROMPT = `Write a single-line caption for this photo — it is pose/mood metadata for a companion app that lets the user pick a picture that fits the moment.

Rules:
- One sentence, roughly 15–30 words, present tense, NO leading pronoun
- Start with the pose/action, and include the location and lighting.
- Cover: outfit / state of undress, specific pose and position, what her hair is doing, gaze/expression, and the overall mood.
- Take extra care to describe the pose, especially if she's sitting/kneeling/lying down, and what her hands are doing.

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
  if (apiKey === undefined || apiKey === "") {
    throw new Error("OPENROUTER_API_KEY is not set — put it in .env.");
  }
  const baseUrl = process.env.LLM_URL ?? "https://openrouter.ai/api/v1";
  // Qwen2.5-VL 72B — a strong open vision model on OpenRouter. Override with
  // DESCRIBE_MODEL to try another (e.g. google/gemini-2.5-flash for cheap bulk).
  const model = process.env.DESCRIBE_MODEL ?? "qwen/qwen-2.5-vl-72b-instruct";

  const ext = extname(imagePath).toLowerCase();
  const mime = MIME[ext];
  if (mime === undefined) {
    throw new Error(`Unsupported image type: ${ext || "(none)"}`);
  }
  const dataUri = `data:${mime};base64,${readFileSync(imagePath).toString(
    "base64",
  )}`;

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
    throw new Error(
      `Request failed: ${res.status} ${res.statusText}\n${await res.text()}`,
    );
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(
      `No caption was returned:\n${JSON.stringify(data, null, 2)}`,
    );
  }

  // Collapse to one line and strip any wrapping quotes the model may add.
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

// CLI: describe one image and write its sidecar. Runs only when invoked
// directly (not when imported by describe-missing.mjs).
async function main() {
  const imagePath = process.argv[2];
  if (imagePath === undefined || imagePath === "") {
    console.error("Usage: npm run describe <path-to-image>");
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
