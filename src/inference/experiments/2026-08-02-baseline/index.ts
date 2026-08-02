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
import type { Experiment } from '../../experiment';
import type { FieldValue } from '../../fields';
import { PROMPT } from './prompt';

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

async function run(imagePath: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    throw new Error('OPENROUTER_API_KEY is not set — put it in .env.');
  }
  const baseUrl = process.env.LLM_URL ?? 'https://openrouter.ai/api/v1';

  const ext = extname(imagePath).slice(1).toLowerCase();
  if (MEDIA_TYPES[ext]?.kind !== 'image') {
    throw new Error(`Not a picture: ${extname(imagePath) || '(no extension)'}`);
  }
  const dataUri = `data:image/jpeg;base64,${resizedJpeg(imagePath).toString('base64')}`;

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
    throw new Error(`No reply was returned:\n${JSON.stringify(data, null, 2)}`);
  }
  return raw.trim();
}

export function parse(raw: string): Record<string, FieldValue> {
  const marked = [...raw.matchAll(/^[ \t]*NAKED:[ \t]*(true|false)\b/gim)];
  const last = marked[marked.length - 1];
  if (last === undefined) return {};
  return { naked: last[1]?.toLowerCase() === 'true' };
}

export const experiment: Experiment = {
  id: ID,
  parameters: { model: MODEL, maxEdge: MAX_EDGE, temperature: TEMPERATURE },
  run,
  parse,
};
