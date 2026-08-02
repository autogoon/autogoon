// An experiment's output: the parameters it ran under, recorded once, and one
// record of answers per item. The formats and the reasoning are in
// docs/2026-08-02-inference-ui-spec.md → Run output.
//
// The parameters are hoisted out of the per-item records because they belong to
// the experiment rather than to any item. What keeps that true is the refusal
// below: a run whose parameters differ from the recorded ones is refused, since
// a different model or resolution is a different experiment. Without it a single
// hoisted record would describe neither run, because items are generated one at
// a time over days.

import type { FieldValue } from './fields';

export type RunParameters = {
  model: string;
  maxEdge: number;
  temperature: number;
};

// Per item: when and at which commit, and the fields derived from the stored
// raw reply. The reply itself is a file of its own — it is prose, and reading it
// is how a wrong field gets diagnosed.
export type RunFields = {
  ranAt: string;
  commit: string;
  fields: Record<string, FieldValue>;
};

export class RunError extends Error {}
export class RunRefused extends Error {}

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

export function parseParameters(text: string): RunParameters {
  const p = fields(text, "The experiment's parameters file");
  if (typeof p.model !== 'string' || p.model === '') {
    throw new RunError('The parameters file has no model.');
  }
  if (typeof p.maxEdge !== 'number' || !Number.isFinite(p.maxEdge)) {
    throw new RunError('The parameters file has no maxEdge.');
  }
  if (typeof p.temperature !== 'number' || !Number.isFinite(p.temperature)) {
    throw new RunError('The parameters file has no temperature.');
  }
  return {
    model: p.model,
    maxEdge: p.maxEdge,
    temperature: p.temperature,
  };
}

export const renderParameters = (p: RunParameters): string =>
  `${JSON.stringify({ model: p.model, maxEdge: p.maxEdge, temperature: p.temperature }, null, 2)}\n`;

export function parseRunFields(text: string): RunFields {
  const r = fields(text, "A run's fields file");
  if (typeof r.ranAt !== 'string' || r.ranAt === '') {
    throw new RunError('The run has no ranAt.');
  }
  if (typeof r.commit !== 'string') {
    throw new RunError('The run has no commit.');
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
  return { ranAt: r.ranAt, commit: r.commit, fields: parsed };
}

export const renderRunFields = (r: RunFields): string =>
  `${JSON.stringify(r, null, 2)}\n`;

// The refusal. Names what differs, because the answer is either to put the
// override back or to start a new experiment, and which one depends on which
// value moved.
export function checkParameters(
  recorded: RunParameters,
  current: RunParameters,
): void {
  const differences: string[] = [];
  if (recorded.model !== current.model) {
    differences.push(`model ${recorded.model} → ${current.model}`);
  }
  if (recorded.maxEdge !== current.maxEdge) {
    differences.push(`maxEdge ${recorded.maxEdge} → ${current.maxEdge}`);
  }
  if (recorded.temperature !== current.temperature) {
    differences.push(
      `temperature ${recorded.temperature} → ${current.temperature}`,
    );
  }
  if (differences.length === 0) return;
  throw new RunRefused(
    `This experiment already ran under different parameters (${differences.join(
      ', ',
    )}). Restore them, or copy the experiment to a new directory — a different model or resolution is a different experiment.`,
  );
}
