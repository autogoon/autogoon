// The corpus's counts. What each one has to get right is the difference
// between an answer a person gave and one an experiment filled in: an item the
// baseline has answered is work outstanding, not work done.

import { describe, expect, it } from '@jest/globals';
import { FIELDS, UNKNOWN, type FieldValue } from './fields';
import { HUMAN, type Labels } from './labels';
import type { SurveyedItem } from './item';
import { summarise } from './summary';

const BASELINE = '2026-08-02-baseline';

const item = (
  stem: string,
  labels: Labels | null = null,
  runs: string[] = [],
): SurveyedItem => ({
  stem,
  file: `${stem}.jpg`,
  kind: 'image',
  hasLabels: labels !== null,
  labels,
  runs,
});

const byHuman = (value: FieldValue): Labels => ({
  naked: { value, source: HUMAN },
});

// Every field answered by a person. `confirmed` turns on the whole set, so a
// fixture naming one field stops meaning "answered" the moment another field
// is added.
const everyField = (): Labels =>
  Object.fromEntries(
    FIELDS.map((f) => [f.id, { value: f.options[0]!.value, source: HUMAN }]),
  );
const bySeed = (value: boolean): Labels => ({
  naked: { value, source: BASELINE },
});

describe('summarise', () => {
  it('counts the corpus and splits it by kind', () => {
    const summary = summarise([
      item('a'),
      item('b'),
      { ...item('c'), kind: 'video' },
    ]);
    expect(summary).toMatchObject({ total: 3, images: 2, videos: 1 });
  });

  it('counts an item confirmed when a person answered every field', () => {
    expect(summarise([item('a', everyField())]).confirmed).toBe(1);
  });

  it('does not count an item confirmed while a field is unanswered', () => {
    const missing = everyField();
    delete missing[FIELDS[0]!.id];
    expect(summarise([item('a', missing)]).confirmed).toBe(0);
  });

  it('counts an item answered Unknown as confirmed, since it was answered', () => {
    const labels = everyField();
    labels.naked = { value: UNKNOWN, source: HUMAN };
    expect(summarise([item('a', labels)]).confirmed).toBe(1);
  });

  it('does not count an item the experiment answered as confirmed', () => {
    expect(summarise([item('a', bySeed(true))]).confirmed).toBe(0);
  });

  it('counts an item nothing has answered as untouched', () => {
    expect(summarise([item('a'), item('b', {})]).untouched).toBe(2);
  });

  it('does not count a seeded item as untouched — it is work outstanding', () => {
    expect(summarise([item('a', bySeed(true))]).untouched).toBe(0);
  });

  it('tallies how many items each experiment has answered', () => {
    expect(
      summarise([
        item('a', null, [BASELINE]),
        item('b', null, [BASELINE, '2026-09-01-nudenet']),
      ]).runs,
    ).toEqual({ [BASELINE]: 2, '2026-09-01-nudenet': 1 });
  });

  it("splits a field's answers into confirmed and seeded", () => {
    const summary = summarise([
      item('a', byHuman(true)),
      item('b', byHuman(false)),
      item('c', bySeed(true)),
    ]);
    expect(summary.fields[0]).toMatchObject({
      id: 'naked',
      confirmed: 2,
      seeded: 1,
    });
  });

  it('spreads the confirmed answers across the options', () => {
    const summary = summarise([
      item('a', byHuman(true)),
      item('b', byHuman(true)),
      item('c', byHuman(false)),
    ]);
    expect(summary.fields[0]?.values).toContainEqual({
      label: 'Yes',
      count: 2,
    });
    expect(summary.fields[0]?.values).toContainEqual({ label: 'No', count: 1 });
  });

  it('lists an option nothing was labelled with at nought', () => {
    expect(
      summarise([item('a', byHuman(true))]).fields[0]?.values,
    ).toContainEqual({ label: 'No', count: 0 });
  });

  it('shows a value no option covers rather than dropping it', () => {
    const summary = summarise([
      item('a', { naked: { value: 'sort of', source: HUMAN } }),
    ]);
    expect(summary.fields[0]?.values).toContainEqual({
      label: 'sort of',
      count: 1,
    });
  });

  it('counts nothing over an empty corpus', () => {
    expect(summarise([])).toMatchObject({
      total: 0,
      confirmed: 0,
      untouched: 0,
      runs: {},
    });
  });
});
