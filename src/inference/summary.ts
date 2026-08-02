// What the corpus adds up to, counted from the listing the routes already
// return. No second source: the same records the review screen reads are what
// these numbers come from.
//
// The distinction every count here turns on is who answered. An item an
// experiment has filled is not a labelled item — it is an item waiting to be
// looked at — so `confirmed` counts only what a person answered, and `seeded`
// is the worklist.

import { FIELDS, optionLabel, type FieldValue } from './fields';
import { HUMAN, type Labels } from './labels';
import type { SurveyedItem } from './item';

export type ValueTally = { label: string; count: number };

export type FieldTally = {
  id: string;
  label: string;
  // Answers a person gave, and answers still holding an experiment's.
  confirmed: number;
  seeded: number;
  // How the confirmed answers are spread across the field's options — the
  // ground truth's own distribution, which is what says whether a case is
  // represented at all.
  values: ValueTally[];
};

export type CorpusSummary = {
  total: number;
  images: number;
  videos: number;
  // Items where every field has a person's answer.
  confirmed: number;
  // Items nothing has answered at all.
  untouched: number;
  // Experiment id to the number of items it has answered.
  runs: Record<string, number>;
  fields: FieldTally[];
};

const confirmedValue = (
  labels: Labels | null,
  id: string,
): FieldValue | undefined => {
  const answer = labels?.[id];
  return answer !== undefined && answer.source === HUMAN
    ? answer.value
    : undefined;
};

export function summarise(items: SurveyedItem[]): CorpusSummary {
  const runs: Record<string, number> = {};
  let images = 0;
  let videos = 0;
  let confirmed = 0;
  let untouched = 0;

  for (const item of items) {
    if (item.kind === 'image') images += 1;
    else videos += 1;
    if (item.labels === null || Object.keys(item.labels).length === 0) {
      untouched += 1;
    }
    if (FIELDS.every((f) => confirmedValue(item.labels, f.id) !== undefined)) {
      confirmed += 1;
    }
    for (const id of item.runs) runs[id] = (runs[id] ?? 0) + 1;
  }

  const fields = FIELDS.map((field) => {
    const counts = new Map<FieldValue, number>();
    let byHuman = 0;
    let bySeed = 0;
    for (const item of items) {
      const answer = item.labels?.[field.id];
      if (answer === undefined) continue;
      if (answer.source === HUMAN) {
        byHuman += 1;
        counts.set(answer.value, (counts.get(answer.value) ?? 0) + 1);
      } else {
        bySeed += 1;
      }
    }
    return {
      id: field.id,
      label: field.label,
      confirmed: byHuman,
      seeded: bySeed,
      // Every option is listed, zero included: an option nothing has been
      // labelled with is the case the corpus is missing, and it can only say so
      // by being there at nought.
      values: field.options.map((option) => ({
        label: option.label,
        count: counts.get(option.value) ?? 0,
      })),
    } satisfies FieldTally;
  });

  // A value no option covers — a field whose options changed after labelling —
  // is appended rather than dropped, so it shows as the anomaly it is.
  for (const field of FIELDS) {
    const tally = fields.find((f) => f.id === field.id)!;
    for (const item of items) {
      const answer = item.labels?.[field.id];
      if (answer === undefined || answer.source !== HUMAN) continue;
      const known = field.options.some((o) => o.value === answer.value);
      if (known) continue;
      const label = optionLabel(field, answer.value);
      const existing = tally.values.find((v) => v.label === label);
      if (existing === undefined) tally.values.push({ label, count: 1 });
      else existing.count += 1;
    }
  }

  return {
    total: items.length,
    images,
    videos,
    confirmed,
    untouched,
    runs,
    fields,
  };
}
