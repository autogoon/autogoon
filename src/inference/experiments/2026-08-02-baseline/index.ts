// The baseline experiment — README.md describes the approach.
//
// Derived from scripts/describe-image.ts as it stood on 2 August 2026, with a
// naked flag added to the prompt.
//
// macOS-only: the downscale shells out to `sips`.

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MEDIA_TYPES } from '@/lib/goonpacks/media';
import type { Exchange, Experiment, Inferred } from '../../experiment';
import type { FieldValue } from '../../fields';
import { PROMPT_ONE, PROMPT_TWO } from './prompt';

export const ID = '2026-08-02-baseline';

const MAX_EDGE = 1024;
const JPEG_QUALITY = 80;
const TEMPERATURE = 0;

// One model per call, because the two calls ask different things of different
// things. The first is handed a picture and needs a vision model; the second is
// handed text, where a far larger and cheaper field of models is available and
// nothing is paid for an image tower that goes unused.
//
// Others to try, priced per million output tokens as at 3 August 2026 — verify
// the slug and the price at https://openrouter.ai/models, since the catalogue
// shifts. All of these are unmoderated (OpenRouter runs no filter in front of
// the endpoint), which is not the same as the model answering: one that refuses
// leaves the first reply a refusal and every field Unknown. `:nitro` is not a
// model but a routing suffix, taking whichever provider of that model is
// fastest.
//
//   Dense — every parameter on every token, which is what a fine visual
//   discrimination wants:
//     qwen/qwen3-vl-32b-instruct                 $0.42
//     z-ai/glm-4.6v                              $0.90
//
//   Sparse — more parameters, fewer of them per token, so faster and cheaper
//   per unit of size:
//     qwen/qwen3-vl-30b-a3b-instruct             $0.52   (3B active)
//     meta-llama/llama-4-maverick                $0.80
//     minimax/minimax-m3                         $1.20
//     qwen/qwen3-vl-235b-a22b-instruct           $1.90   (22B active)
//
//   Thinking — reasons before answering, which is what a hard visual call
//   wants and what PROMPT_ONE asks for in prose anyway:
//     qwen/qwen3-vl-30b-a3b-thinking             $2.40
//     qwen/qwen3-vl-235b-a22b-thinking           $3.95
//
//   Google, if Qwen won't grade consistently:
//     google/gemini-3.1-flash-lite               $1.50
//     google/gemini-2.5-flash                    $2.50
//     google/gemini-3.6-flash                    $7.50
//
//   Text only, for the second call:
//     mistralai/mistral-small-24b-instruct-2501  $0.08
//     openai/gpt-oss-120b                        $0.17
//     deepseek/deepseek-v4-flash                 $0.18
//     qwen/qwen3-30b-a3b-instruct-2507           $0.19
const MODEL = 'qwen/qwen3-vl-30b-a3b-instruct:nitro';
const TEXT_MODEL = 'qwen/qwen3-30b-a3b-instruct-2507:nitro';

function resizedJpeg(imagePath: string): Buffer {
  const tmp = join(tmpdir(), `inference-${randomUUID()}.jpg`);
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
      `sips failed to resize ${imagePath} (this needs macOS): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  } finally {
    rmSync(tmp, { force: true });
  }
}

// Where PROMPT_TWO takes the first call's reply.
const DESCRIPTION = '{{DESCRIPTION}}';

// One completion, from whichever model the caller is asking. `image` is the
// data URI where the call sends a picture, and absent where it sends text
// alone.
async function ask(
  model: string,
  prompt: string,
  image?: string,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    throw new Error('OPENROUTER_API_KEY is not set — put it in .env.');
  }
  const baseUrl = process.env.LLM_URL ?? 'https://openrouter.ai/api/v1';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:8931',
      'X-Title': `autogoon ${ID}`,
    },
    body: JSON.stringify({
      model,
      temperature: TEMPERATURE,
      messages: [
        {
          role: 'user',
          content:
            image === undefined
              ? [{ type: 'text', text: prompt }]
              : [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: image } },
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
    throw new Error(`No reply was returned:\n${JSON.stringify(data, null, 2)}`);
  }
  return raw.trim();
}

// Two calls to two models. The first looks at the picture and reasons about it;
// the second reads that reasoning as text and nothing else, and answers the
// checklist from it. The picture reaches a model once, so what the second call
// can say is bounded by what the first wrote down — which is the point of the
// split.
//
// Both are answered with, so both are stored: the first reply is the whole of
// what the second had to work from, and reading the second against it is how a
// wrong answer is attributed to the looking or to the reading.
async function run(imagePath: string): Promise<Exchange[]> {
  const ext = extname(imagePath).slice(1).toLowerCase();
  if (MEDIA_TYPES[ext]?.kind !== 'image') {
    throw new Error(`Not a picture: ${extname(imagePath) || '(no extension)'}`);
  }
  const dataUri = `data:image/jpeg;base64,${resizedJpeg(imagePath).toString('base64')}`;

  const described = await ask(MODEL, PROMPT_ONE, dataUri);
  const second = secondPrompt(described);
  return [
    { prompt: PROMPT_ONE, reply: described },
    { prompt: second, reply: await ask(TEXT_MODEL, second) },
  ];
}

// PROMPT_TWO with the first reply in it. An edit to PROMPT_TWO that loses the
// placeholder throws rather than sending a prompt describing nothing, which
// would otherwise cost a call per item and answer from thin air.
export function secondPrompt(described: string): string {
  if (!PROMPT_TWO.includes(DESCRIPTION)) {
    throw new Error(`PROMPT_TWO has no ${DESCRIPTION} for the first reply.`);
  }
  return PROMPT_TWO.replace(DESCRIPTION, described);
}

// The words the reply may answer each field with, and what they store. Written
// out here rather than read from fields.ts: fingerprint.ts hashes this directory
// alone, so a value this experiment records has to live in it or an edit
// elsewhere would change what it produces without moving its version.
//
// `values` maps the words a choice line may answer with to what it stores; a
// field without one keeps the line as written, which is what a text field
// wants. It is also what separates the short answers from the prose: see
// endOfProse.
//
// Only the fields fields.ts asks about. The prompt asks for more markers than
// these, and a value the field set has nowhere to put is one nothing can show
// or score.
const YES_NO = { yes: true, no: false, unknown: 'unknown' };

// One marked line: `NAME: <what it says>`. Built rather than written out
// thirteen times, so the shape the prompt asks for is stated once.
const marker = (name: string): RegExp =>
  new RegExp(`^[ \\t]*${name}:[ \\t]*(.+)$`, 'gim');

const CAPTION = marker('CAPTION');

const ANSWERS: {
  id: string;
  marker: RegExp;
  values?: Record<string, FieldValue>;
}[] = [
  { id: 'hair', marker: marker('HAIR') },
  { id: 'gaze', marker: marker('GAZE') },
  { id: 'setting', marker: marker('SETTING') },
  { id: 'bodyShape', marker: marker('BODY SHAPE') },
  { id: 'clothing', marker: marker('CLOTHING') },
  { id: 'exposed', marker: marker('EXPOSED') },
  { id: 'naked', marker: marker('NAKED'), values: YES_NO },
  {
    id: 'breastSize',
    marker: marker('BREAST SIZE'),
    values: {
      small: 'small',
      medium: 'medium',
      large: 'large',
      'very large': 'veryLarge',
      unknown: 'unknown',
    },
  },
  { id: 'wearingBra', marker: marker('WEARING BRA'), values: YES_NO },
  { id: 'wearingPanties', marker: marker('WEARING PANTIES'), values: YES_NO },
  { id: 'topless', marker: marker('TOPLESS'), values: YES_NO },
  {
    id: 'nippleVisibility',
    marker: marker('NIPPLE VISIBILITY'),
    values: {
      'bare and visible': 'bare',
      'through sheer fabric': 'throughSheer',
      'shape visible through opaque fabric': 'shapeThroughOpaque',
      'not visible': 'notVisible',
      unknown: 'unknown',
    },
  },
  {
    id: 'genitalVisibility',
    marker: marker('GENITAL VISIBILITY'),
    values: {
      visible: 'visible',
      'not visible': 'notVisible',
      unknown: 'unknown',
    },
  },
  { id: 'text', marker: marker('TEXT') },
  { id: 'caption', marker: CAPTION },
];

// A line the format template left unanswered. The reply sometimes echoes the
// template back before answering it, and `<colour and what it is doing>` is not
// a description of anybody's hair.
const TEMPLATE = /^<.*>$/;

// The word a choice line answers with. It is read off the front rather than
// from the whole line, because the model reliably justifies itself after it:
// `NAKED: No — she is wearing a bralette and thong`. Longest word first, so
// `very large` isn't read as nothing, and the character after it has to be a
// non-letter, so `nothing` isn't read as `no`.
function chosen(
  line: string,
  values: Record<string, FieldValue>,
): FieldValue | undefined {
  const said = line.toLowerCase();
  for (const word of Object.keys(values).sort((a, b) => b.length - a.length)) {
    if (!said.startsWith(word)) continue;
    const after = said.charAt(word.length);
    if (after === '' || !/[a-z]/.test(after)) return values[word];
  }
  return undefined;
}

// The last line a field's answer can be read off — not simply the last one,
// because a template line says nothing either kind of field recognises. A field
// with no readable line is absent rather than guessed.
function fields(raw: string): Record<string, FieldValue> {
  const answered: Record<string, FieldValue> = {};
  for (const { id, marker, values } of ANSWERS) {
    const read = [...raw.matchAll(marker)]
      .map((match) => {
        const line = (match[1] ?? '').trim();
        if (line === '' || TEMPLATE.test(line)) return undefined;
        return values === undefined ? line : chosen(line, values);
      })
      .filter((value) => value !== undefined);
    const last = read[read.length - 1];
    if (last !== undefined) answered[id] = last;
  }
  return answered;
}

// A heading with nothing after it — `OBSERVATIONS:`, `REASONING:` — which opens
// the prose rather than being part of it.
const HEADING = /^[ \t]*[A-Z][A-Z ]*:[ \t]*$\n?/m;

// Where the description stops: the first line answering a field from a word
// list, or the caption. The lines above those are prose the model wrote about
// the picture — `HAIR:` and `SETTING:` are marked too, and belong in the
// description rather than after it — so the cut is at the short answers, not at
// the first marked line of any kind.
function endOfProse(raw: string): number {
  const starts = [
    ...ANSWERS.filter((a) => a.values !== undefined),
    { marker: CAPTION },
  ]
    .map((a) => [...raw.matchAll(a.marker)][0]?.index)
    .filter((at) => at !== undefined);
  return starts.length === 0 ? raw.length : Math.min(...starts);
}

// The prose the model wrote before it started answering: the description a pack
// would play, and a field like the rest.
const prose = (raw: string): string =>
  raw.slice(0, endOfProse(raw)).replace(HEADING, '').trim();

// A clause naming what isn't there. The caption is a search index, so "nipples
// not visible" is worse than saying nothing: it indexes *nipples* and the
// picture is then found by someone looking for them. PROMPT_TWO asks for none
// of these, and this is what holds when the model writes one anyway — a rule
// refined here re-applies to every stored reply through Reparse, with nothing
// to pay.
//
// Clause by clause, because the prompt asks for a comma-separated list: a
// caption that names five things and denies a sixth keeps the five. An
// experiment writing prose captions would cut differently, which is why this
// lives here rather than anywhere the app could reach.
// Whole words, so `knot` and `notable` survive. `nothing` goes with the rest
// even where it carries something — "wearing nothing else" says the thong is
// all there is — because the rule cannot tell that from "no bra visible", and
// `naked` is a marked answer either way.
const ABSENT =
  /\b(?:no|not|nothing|without|hidden|obscured|covered|absent|none)\b|\w+less\b/i;

const kept = (caption: string): string =>
  caption
    .split(',')
    .filter((clause) => !ABSENT.test(clause))
    .map((clause) => clause.trim())
    .filter((clause) => clause !== '')
    .join(', ');

// The sidecar is the fields rather than a third thing read off the reply — the
// caption and the description are its named parts, and the rest ride in its
// frontmatter as the values they were parsed into. So what a pack plays and
// what is scored against ground truth are the same answers by construction.
//
// This is the experiment's own sidecar, so every value in it is the
// experiment's. What a pack ships is composed at build time, taking a person's
// label over the experiment's answer key by key
// (src/inference/pack-contents.ts).
export function parse(raw: string): Inferred {
  const answered = fields(raw);
  const description = prose(raw);
  if (description !== '') answered.description = description;
  // Models wrap a caption in quotes often enough to be worth taking off, and
  // never mean them as part of it.
  const caption = kept(
    String(answered.caption ?? '')
      .replace(/^["']|["']$/g, '')
      .trim(),
  );
  if (caption === '') {
    throw new Error(`No caption could be read from the reply:\n${raw}`);
  }
  answered.caption = caption;
  if (description === '') {
    throw new Error(
      'The reply carried a caption and no observations — the sidecar needs both.',
    );
  }
  return {
    fields: answered,
    sidecar: {
      caption,
      description,
      values: Object.fromEntries(
        Object.entries(answered).filter(
          ([id]) => id !== 'caption' && id !== 'description',
        ),
      ),
    },
  };
}

export const experiment: Experiment = {
  id: ID,
  parameters: {
    model: MODEL,
    textModel: TEXT_MODEL,
    maxEdge: MAX_EDGE,
    temperature: TEMPERATURE,
  },
  run,
  parse,
};
