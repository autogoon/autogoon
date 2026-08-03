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
//   beach.2026-08-02-baseline.raw.txt      that run's reply, verbatim
//   beach.2026-08-02-baseline.sidecar.md   the caption and description it wrote
//
// `beach.md` — the pack's own sidecar — is none of these and reads as nothing,
// which is what leaves it to the pack.
//
// A stem may contain dots (`beach.holiday.jpg`), so suffixes are matched from
// the right and never by splitting on the first dot. An experiment id may not,
// which is what keeps `<stem>.<id>.fields.json` unambiguous — EXPERIMENT_ID
// enforces it.

import { MEDIA_TYPES, type MediaKind } from '@/lib/goonpacks/media';

// The repo's pack sources. store.ts carries a PACKS_DIR of its own for the OPFS
// directory the app installs packs into, which is a different place wearing the
// same name.
export const PACKS_DIR = 'goonpacks';

// `<date>-<name>`: digits, lowercase and hyphens only. No dots, so the segment
// before `.fields.json` is always the whole id.
export const EXPERIMENT_ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

export const LABELS_SUFFIX = '.labels.json';
export const FIELDS_SUFFIX = '.fields.json';
export const RAW_SUFFIX = '.raw.txt';
export const SIDECAR_SUFFIX = '.sidecar.md';

// What one filename in the corpus turns out to be. `null` from readName means
// the file belongs to nothing the tool knows — a stray note, a .DS_Store, a
// video while v1 is images only — and is left alone rather than reported.
export type CorpusName =
  | { what: 'media'; stem: string; file: string; kind: MediaKind }
  | { what: 'labels'; stem: string }
  | { what: 'fields'; stem: string; experiment: string }
  | { what: 'raw'; stem: string; experiment: string }
  | { what: 'sidecar'; stem: string; experiment: string };

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

export function readName(file: string): CorpusName | null {
  if (file.endsWith(LABELS_SUFFIX)) {
    const stem = file.slice(0, -LABELS_SUFFIX.length);
    return stem === '' ? null : { what: 'labels', stem };
  }
  if (file.endsWith(FIELDS_SUFFIX)) {
    const split = splitExperiment(file.slice(0, -FIELDS_SUFFIX.length));
    return split === null ? null : { what: 'fields', ...split };
  }
  if (file.endsWith(RAW_SUFFIX)) {
    const split = splitExperiment(file.slice(0, -RAW_SUFFIX.length));
    return split === null ? null : { what: 'raw', ...split };
  }
  if (file.endsWith(SIDECAR_SUFFIX)) {
    const split = splitExperiment(file.slice(0, -SIDECAR_SUFFIX.length));
    return split === null ? null : { what: 'sidecar', ...split };
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

export const labelsName = (stem: string): string => `${stem}${LABELS_SUFFIX}`;
export const fieldsName = (stem: string, experiment: string): string =>
  `${stem}.${experiment}${FIELDS_SUFFIX}`;
export const rawName = (stem: string, experiment: string): string =>
  `${stem}.${experiment}${RAW_SUFFIX}`;
export const sidecarName = (stem: string, experiment: string): string =>
  `${stem}.${experiment}${SIDECAR_SUFFIX}`;
