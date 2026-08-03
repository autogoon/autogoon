// Ground truth: what is actually true of one item, and where each answer came
// from. The format and the rules are in
// docs/2026-08-02-inference-ui-spec.md — one record per item, each field
// carrying its value and a source, and an absent field meaning nobody has
// answered.
//
// The rule everything else depends on: a run fills only absent fields and
// stamps its own id, a reviewer's answer stamps `human`, and neither ever
// overwrites the other. That is what lets a new field be added later and
// back-filled by replaying an old experiment without disturbing a single
// curated answer.

import type { FieldValue } from './fields';

// Where an answer came from: `human`, or the id of the experiment that filled
// it. Kept as a plain string so an experiment id needs no separate encoding.
export const HUMAN = 'human';

export type Answer = { value: FieldValue; source: string };
export type Labels = Record<string, Answer>;

export class LabelError extends Error {}

export const isConfirmed = (answer: Answer): boolean => answer.source === HUMAN;

// Read a labels file. Throws rather than repairing: a record that won't parse
// is a file someone edited by hand and got wrong, and silently dropping a field
// would lose an answer that took a human to produce.
export function parseLabels(text: string): Labels {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LabelError('The labels file is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new LabelError('The labels file is not a set of fields.');
  }
  const labels: Labels = {};
  for (const [id, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new LabelError(`${id} is not an answer with a value and a source.`);
    }
    const { value, source } = raw as Record<string, unknown>;
    if (typeof value !== 'boolean' && typeof value !== 'string') {
      throw new LabelError(`${id} has no value.`);
    }
    if (typeof source !== 'string' || source === '') {
      throw new LabelError(`${id} has no source.`);
    }
    labels[id] = { value, source };
  }
  return labels;
}

// Written with sorted keys and a trailing newline: the corpus is read in a file
// browser and diffed by eye, so two records of the same fields should look the
// same.
export function renderLabels(labels: Labels): string {
  const sorted: Labels = {};
  for (const id of Object.keys(labels).sort()) {
    sorted[id] = labels[id]!;
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

// A reviewer answering. Always wins, always stamps `human`.
export function answer(labels: Labels, id: string, value: FieldValue): Labels {
  return { ...labels, [id]: { value, source: HUMAN } };
}

// A reviewer taking an answer back: the field returns to absent.
export function clear(labels: Labels, id: string): Labels {
  const rest = { ...labels };
  delete rest[id];
  return rest;
}

// A run's answers arriving. Fills only what nothing has answered, so replaying
// an experiment over a corpus back-fills a newly added field and touches
// nothing else.
export function fillAbsent(
  labels: Labels,
  fields: Record<string, FieldValue>,
  source: string,
): Labels {
  const filled = { ...labels };
  for (const [id, value] of Object.entries(fields)) {
    if (filled[id] === undefined) filled[id] = { value, source };
  }
  return filled;
}
