// An experiment's output for one item. The format and the reasoning are in
// docs/2026-08-02-inference-ui-spec.md → Run output.
//
// Every record carries its own parameters. Items are inferred one at a time
// over days and an experiment may be edited between two of them, so a single
// record per experiment could only describe the last run — and the version a
// record carries identifies the code that produced it without being readable
// back into a model name. The two together make a result answer "what made
// this?" on its own.

import type { FieldValue } from './fields';

// What the run is worth reading back in plain words. A hash says which code
// ran; this says what it asked for.
export type RunParameters = {
  // The model that was sent the picture.
  model: string;
  // The model that was sent the first call's reply, where an experiment splits
  // looking from reading. Absent where one model did both.
  textModel?: string;
  maxEdge: number;
  temperature: number;
};

// Per item: when it ran, the version of the experiment that ran it (see
// fingerprint.ts), what that run used, and the fields derived from the stored
// raw reply. The reply itself is a file of its own — it is prose, and reading
// it is how a wrong field gets diagnosed.
export type RunFields = {
  ranAt: string;
  // Absent in a record written before versions were stamped, which reads as out
  // of date: nobody knows what produced it.
  version?: string;
  parameters: RunParameters;
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

function parseParameters(raw: unknown): RunParameters {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new RunError('The run has no parameters.');
  }
  const { model, textModel, maxEdge, temperature } = raw as Record<
    string,
    unknown
  >;
  if (typeof model !== 'string' || model === '') {
    throw new RunError("The run's parameters name no model.");
  }
  if (textModel !== undefined && typeof textModel !== 'string') {
    throw new RunError("The run's textModel is not a model name.");
  }
  if (typeof maxEdge !== 'number' || typeof temperature !== 'number') {
    throw new RunError("The run's maxEdge and temperature are not numbers.");
  }
  return {
    model,
    ...(textModel === undefined ? {} : { textModel }),
    maxEdge,
    temperature,
  };
}

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
    parameters: parseParameters(r.parameters),
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
