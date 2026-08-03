// The corpus's filename conventions, in one place. A corpus is a pack's
// media/, and every file in one is flat and named from the item it belongs to,
// so the directory listing alone says what exists — no file is opened to find
// out. docs/2026-08-02-inference-ui-spec.md describes the layout and why it is
// flat.
//
// Reading a name is stripping a known suffix from the right:
//
//   beach.jpg                              media
//   beach.labels.json                      ground truth
//   beach.2026-08-02-baseline.fields.json  a run's answers
//   beach.2026-08-02-baseline.sidecar.md   the caption and description it wrote
//   beach.2026-08-02-baseline.prompt.txt   what its first call asked
//   beach.2026-08-02-baseline.raw.txt      what that call answered
//   beach.2026-08-02-baseline.prompt2.txt  the second call, where there is one
//   beach.2026-08-02-baseline.raw2.txt
//
// All of those are the latest run's, overwritten by the next. Each is also
// written under a name carrying when the run happened and which version ran it:
//
//   beach.2026-08-02-baseline.20260803154212.5a4919b862f2.raw.txt
//
// The time comes first so an item's block sorts chronologically, and the
// version follows so every archived file names the code that made it rather
// than only fields.json carrying it inside. These are kept for reference; the
// app reads the latest and leaves them alone.
//
// `beach.md` — the pack's own sidecar — is none of these and reads as nothing,
// which is what leaves it to the pack.
//
// A stem may contain dots (`beach.holiday.jpg`), so suffixes are matched from
// the right and never by splitting on the first dot. An experiment id may not,
// which is what keeps `<stem>.<id>.fields.json` unambiguous — EXPERIMENT_ID
// enforces it, and RUN_AT and VERSION do the same for the two archive segments.

import { MEDIA_TYPES, type MediaKind } from '@/lib/goonpacks/media';

// The repo's pack sources. store.ts carries a PACKS_DIR of its own for the OPFS
// directory the app installs packs into, which is a different place wearing the
// same name.
export const PACKS_DIR = 'goonpacks';

// `<date>-<name>`: digits, lowercase and hyphens only. No dots, so the segment
// before `.fields.json` is always the whole id.
export const EXPERIMENT_ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

// `YYYYMMDDHHmmss`, and a hex hash — fingerprint.ts sets how long. Neither can
// be mistaken for an experiment id, which needs hyphens in a date's places.
export const RUN_AT = /^\d{14}$/;
export const VERSION = /^[0-9a-f]{6,}$/;

export const LABELS_SUFFIX = '.labels.json';
export const FIELDS_SUFFIX = '.fields.json';
export const SIDECAR_SUFFIX = '.sidecar.md';

// A prompt and the reply it got, numbered by the call they belong to: an
// experiment may make several, and a reply means little without the question
// above it. The first call carries no number, so a one-call experiment writes
// the names it always did.
//
//   beach.<id>.prompt.txt    beach.<id>.raw.txt     the first call
//   beach.<id>.prompt2.txt   beach.<id>.raw2.txt    the second
export const PROMPT_SUFFIX = '.prompt.txt';
export const RAW_SUFFIX = '.raw.txt';
const PROMPT_AT = /\.prompt([2-9]|[1-9]\d+)?\.txt$/;
const RAW_AT = /\.raw([2-9]|[1-9]\d+)?\.txt$/;

// The number a call's files carry: nothing for the first, the figure after it.
const numbered = (at: number): string => (at === 1 ? '' : String(at));

// Which run an archived file belongs to: when it ran, and the version that ran
// it. Both are filename segments, so `at` is `YYYYMMDDHHmmss` rather than the
// ISO string the record carries.
export type RunStamp = { at: string; version: string };

// One of the files an experiment writes. `run` is set on the archived copy and
// absent on the latest.
type Wrote = { stem: string; experiment: string; run?: RunStamp };

// What one filename in the corpus turns out to be. `null` from readName means
// the file belongs to nothing the tool knows — a stray note, a .DS_Store, a
// video while v1 is images only — and is left alone rather than reported.
//
// A prompt or a reply carries `at`, the call it belongs to, counting from one.
export type CorpusName =
  | { what: 'media'; stem: string; file: string; kind: MediaKind }
  | { what: 'labels'; stem: string }
  | ({ what: 'fields' | 'sidecar' } & Wrote)
  | ({ what: 'raw' | 'prompt'; at: number } & Wrote);

// Split `<stem>.<experiment>` off a name whose suffix has already been removed.
// Returns null when the trailing segment isn't a valid experiment id, so a
// media file that merely ends in `.fields.json` can't masquerade as a run.
function splitExperiment(
  rest: string,
): { stem: string; experiment: string } | null {
  const dot = rest.lastIndexOf('.');
  if (dot <= 0) return null;
  const experiment = rest.slice(dot + 1);
  if (!EXPERIMENT_ID.test(experiment)) return null;
  return { stem: rest.slice(0, dot), experiment };
}

// Take one segment off the right if it matches, leaving the rest.
function splitSegment(
  rest: string,
  matching: RegExp,
): { rest: string; segment: string } | null {
  const dot = rest.lastIndexOf('.');
  if (dot <= 0) return null;
  const segment = rest.slice(dot + 1);
  return matching.test(segment) ? { rest: rest.slice(0, dot), segment } : null;
}

// `<stem>.<experiment>`, or the archived `<stem>.<experiment>.<at>.<version>`.
// The plain form is tried first: an experiment id can't match VERSION, so the
// two can't both succeed.
function splitWrote(rest: string): Wrote | null {
  const plain = splitExperiment(rest);
  if (plain !== null) return plain;
  const version = splitSegment(rest, VERSION);
  if (version === null) return null;
  const at = splitSegment(version.rest, RUN_AT);
  if (at === null) return null;
  const split = splitExperiment(at.rest);
  return split === null
    ? null
    : { ...split, run: { at: at.segment, version: version.segment } };
}

const WROTE = [
  { suffix: FIELDS_SUFFIX, what: 'fields' },
  { suffix: SIDECAR_SUFFIX, what: 'sidecar' },
] as const;

const CALLED = [
  { pattern: PROMPT_AT, what: 'prompt' },
  { pattern: RAW_AT, what: 'raw' },
] as const;

export function readName(file: string): CorpusName | null {
  if (file.endsWith(LABELS_SUFFIX)) {
    const stem = file.slice(0, -LABELS_SUFFIX.length);
    return stem === '' ? null : { what: 'labels', stem };
  }
  for (const { suffix, what } of WROTE) {
    if (!file.endsWith(suffix)) continue;
    const split = splitWrote(file.slice(0, -suffix.length));
    return split === null ? null : { what, ...split };
  }
  for (const { pattern, what } of CALLED) {
    const found = pattern.exec(file);
    if (found === null) continue;
    const split = splitWrote(file.slice(0, found.index));
    return split === null
      ? null
      : { what, at: Number(found[1] ?? 1), ...split };
  }
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return null;
  const type = MEDIA_TYPES[file.slice(dot + 1).toLowerCase()];
  if (type === undefined) return null;
  return {
    what: 'media',
    stem: file.slice(0, dot),
    file,
    kind: type.kind,
  };
}

// `YYYYMMDDHHmmss` from the ISO string a record carries, so the two describe
// the same moment and the filename holds nothing a path can't.
export const runAt = (ranAt: string): string =>
  ranAt.replace(/[-:T]/g, '').slice(0, 14);

export const labelsName = (stem: string): string => `${stem}${LABELS_SUFFIX}`;

const wroteName = (
  stem: string,
  experiment: string,
  suffix: string,
  run?: RunStamp,
): string =>
  run === undefined
    ? `${stem}.${experiment}${suffix}`
    : `${stem}.${experiment}.${run.at}.${run.version}${suffix}`;

export const fieldsName = (
  stem: string,
  experiment: string,
  run?: RunStamp,
): string => wroteName(stem, experiment, FIELDS_SUFFIX, run);

export const sidecarName = (
  stem: string,
  experiment: string,
  run?: RunStamp,
): string => wroteName(stem, experiment, SIDECAR_SUFFIX, run);

// `at` is which call, counting from one — the first carries no number.
export const rawName = (
  stem: string,
  experiment: string,
  at = 1,
  run?: RunStamp,
): string => wroteName(stem, experiment, `.raw${numbered(at)}.txt`, run);

export const promptName = (
  stem: string,
  experiment: string,
  at = 1,
  run?: RunStamp,
): string => wroteName(stem, experiment, `.prompt${numbered(at)}.txt`, run);
