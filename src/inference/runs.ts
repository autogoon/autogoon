// An experiment's output: the parameters its last run used, and one record of
// answers per item. The formats and the reasoning are in
// docs/2026-08-02-inference-ui-spec.md → Run output.
//
// The parameters sit in one file per experiment rather than in every item's
// record because they describe the experiment. They are a record and nothing
// more — what says whether an item's answers are current is the `version` it
// carries, since items are generated one at a time over days and an experiment
// may be edited between two of them.

import type { FieldValue } from './fields';

export type RunParameters = {
  model: string;
  maxEdge: number;
  temperature: number;
};

// Per item: when it ran, the version of the experiment that ran it (see
// fingerprint.ts), and the fields derived from the stored raw reply. The reply
// itself is a file of its own — it is prose, and reading it is how a wrong
// field gets diagnosed.
export type RunFields = {
  ranAt: string;
  // Absent in a record written before versions were stamped, which reads as out
  // of date: nobody knows what produced it.
  version?: string;
  fields: Record<string, FieldValue>;
};

export class RunError extends Error {}

function fields(text: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RunError(`${what} is not valid JSON.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RunError(`${what} is not a set of fields.`);
  }
  return parsed as Record<string, unknown>;
}

// Written, never parsed: nothing reads `<experiment>.run.json` back, so the
// field order here is the whole contract — it is what a person opening the
// corpus reads.
export const renderParameters = (p: RunParameters): string =>
  `${JSON.stringify({ model: p.model, maxEdge: p.maxEdge, temperature: p.temperature }, null, 2)}\n`;

export function parseRunFields(text: string): RunFields {
  const r = fields(text, "A run's fields file");
  if (typeof r.ranAt !== 'string' || r.ranAt === '') {
    throw new RunError('The run has no ranAt.');
  }
  if (r.version !== undefined && typeof r.version !== 'string') {
    throw new RunError("The run's version is not a version.");
  }
  const raw = r.fields;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new RunError('The run has no fields.');
  }
  const parsed: Record<string, FieldValue> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'boolean' && typeof value !== 'string') {
      throw new RunError(`The run's ${id} is not a value.`);
    }
    parsed[id] = value;
  }
  return {
    ranAt: r.ranAt,
    ...(r.version === undefined ? {} : { version: r.version }),
    fields: parsed,
  };
}

export const renderRunFields = (r: RunFields): string =>
  `${JSON.stringify(r, null, 2)}\n`;

// Whether an item's answers came from the experiment as it stands. A record
// written before versions were stamped has none, and is out of date for the
// same reason a stale one is: what produced it is not the code on disk.
export const isCurrent = (run: RunFields, version: string): boolean =>
  run.version === version;
