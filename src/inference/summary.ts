// What the corpus adds up to, counted from the listing the routes already
// return. No second source: the same records the review screen reads are what
// these numbers come from.
//
// The distinction every count here turns on is who answered, and the two come
// from different files: a person's answers are the item's labels, the selected
// experiment's are its run. An item an experiment has answered is not a
// labelled item — it is an item waiting to be looked at — so `confirmed` counts
// the labels and `seeded` counts what the run proposed and the labels don't
// cover, which is the worklist.

import { FIELDS, optionLabel, type FieldValue } from './fields';
import { isCurrent } from './runs';
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
  // Items nobody has answered and the selected experiment hasn't run against.
  untouched: number;
  // Experiment id to the number of items it has answered.
  runs: Record<string, number>;
  // Of the surveyed experiment's answers, how many the code on disk would no
  // longer produce — it was edited after they were generated. A sweep of those
  // items is what clears it.
  outdated: number;
  fields: FieldTally[];
};

export function summarise(
  items: SurveyedItem[],
  // The surveyed experiment's version. Every `run` on an item came from that
  // experiment (see corpus.ts), so this is all that is needed to tell a current
  // answer from a left-over one.
  version: string,
): CorpusSummary {
  const runs: Record<string, number> = {};
  let images = 0;
  let videos = 0;
  let confirmed = 0;
  let untouched = 0;
  let outdated = 0;

  for (const item of items) {
    if (item.run !== null && !isCurrent(item.run, version)) outdated += 1;
    if (item.kind === 'image') images += 1;
    else videos += 1;
    const unlabelled =
      item.labels === null || Object.keys(item.labels).length === 0;
    if (unlabelled && item.run === null) untouched += 1;
    if (FIELDS.every((f) => item.labels?.[f.id] !== undefined)) confirmed += 1;
    for (const id of item.runs) runs[id] = (runs[id] ?? 0) + 1;
  }

  const fields = FIELDS.map((field) => {
    const counts = new Map<FieldValue, number>();
    let byHuman = 0;
    let bySeed = 0;
    for (const item of items) {
      const answer = item.labels?.[field.id];
      if (answer !== undefined) {
        byHuman += 1;
        counts.set(answer, (counts.get(answer) ?? 0) + 1);
      } else if (item.run?.fields[field.id] !== undefined) {
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
      if (answer === undefined) continue;
      if (field.options.some((o) => o.value === answer)) continue;
      const label = optionLabel(field, answer);
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
    outdated,
    fields,
  };
}
