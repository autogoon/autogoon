// Ground truth: what a person says is actually true of one item. One record per
// item, each answered field carrying its value, and an absent field meaning
// nobody has answered it — the format is in
// docs/2026-08-02-inference-ui-spec.md.
//
// **Only a person's answers are here.** An experiment's answers live in its own
// `<stem>.<experiment>.fields.json` and are laid over these on screen, so the
// same fact is never recorded twice and the two can never disagree. What an
// experiment says is a proposal; what is in this file is what someone decided.

import type { FieldValue } from './fields';

export type Labels = Record<string, FieldValue>;

export class LabelError extends Error {}

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
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'boolean' && typeof value !== 'string') {
      throw new LabelError(`${id} has no value.`);
    }
    labels[id] = value;
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

// A reviewer answering.
export function answer(labels: Labels, id: string, value: FieldValue): Labels {
  return { ...labels, [id]: value };
}

// A reviewer taking an answer back: the field returns to absent, and whatever
// the selected experiment proposed for it shows again.
export function clear(labels: Labels, id: string): Labels {
  const rest = { ...labels };
  delete rest[id];
  return rest;
}
