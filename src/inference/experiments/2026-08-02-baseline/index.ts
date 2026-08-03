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
import type { Experiment, Inferred, Reply } from '../../experiment';
import type { FieldValue } from '../../fields';
import { PROMPT_ONE, PROMPT_TWO } from './prompt';

export const ID = '2026-08-02-baseline';

const MAX_EDGE = 1024;
const JPEG_QUALITY = 80;
const MODEL = 'qwen/qwen3-vl-235b-a22b-instruct';
const TEMPERATURE = 0;

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

// One completion. `image` is the data URI where the call sends a picture, and
// absent where it sends text alone.
async function ask(prompt: string, image?: string): Promise<string> {
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
      model: MODEL,
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

// Two calls. The first looks at the picture and reasons about it; the second
// sees that reasoning as text and nothing else, and answers the checklist from
// it. The picture reaches the model once, so what the second call can say is
// bounded by what the first wrote down — which is the point of the split.
//
// The prompt returned is both, as sent, so it carries the first reply where it
// actually went: into the second prompt.
async function run(imagePath: string): Promise<Reply> {
  const ext = extname(imagePath).slice(1).toLowerCase();
  if (MEDIA_TYPES[ext]?.kind !== 'image') {
    throw new Error(`Not a picture: ${extname(imagePath) || '(no extension)'}`);
  }
  const dataUri = `data:image/jpeg;base64,${resizedJpeg(imagePath).toString('base64')}`;

  const described = await ask(PROMPT_ONE, dataUri);
  const second = secondPrompt(described);
  return {
    prompt: `${PROMPT_ONE}\n\n${SPLIT}\n\n${second}`,
    raw: await ask(second),
  };
}

// Between the two prompts in the written file, so a person opening it can see
// where one call ended and the next began.
const SPLIT = '=== 2 ===';

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

// The sidecar is two of the fields rather than a third thing read off the
// reply, so what a pack plays and what the caption is scored against are the
// same text by construction.
export function parse(raw: string): Inferred {
  const answered = fields(raw);
  const description = prose(raw);
  if (description !== '') answered.description = description;
  // Models wrap a caption in quotes often enough to be worth taking off, and
  // never mean them as part of it.
  const caption = String(answered.caption ?? '')
    .replace(/^["']|["']$/g, '')
    .trim();
  if (caption === '') {
    throw new Error(`No caption could be read from the reply:\n${raw}`);
  }
  answered.caption = caption;
  if (description === '') {
    throw new Error(
      'The reply carried a caption and no observations — the sidecar needs both.',
    );
  }
  return { fields: answered, sidecar: { caption, description } };
}

export const experiment: Experiment = {
  id: ID,
  parameters: { model: MODEL, maxEdge: MAX_EDGE, temperature: TEMPERATURE },
  run,
  parse,
};
