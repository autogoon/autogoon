// The corpus's counts. Two distinctions they have to get right: an answer a
// person gave against one the selected experiment proposed — an item the
// baseline has answered is work outstanding, not work done — and an
// experiment's answer produced by the code as it stands against one left over
// from before an edit.

import { describe, expect, it } from '@jest/globals';
import { FIELDS, UNKNOWN, type FieldValue } from './fields';
import type { Labels } from './labels';
import type { SurveyedItem } from './item';
import { summarise } from './summary';

const BASELINE = '2026-08-02-baseline';
// The surveyed experiment's version, and one it has moved on from.
const NOW = 'a41f0c2b7d9e';
const BEFORE = '00b3ee91c4d7';
// Every record carries these; nothing counted here reads them.
const PARAMETERS = { model: 'a-model', maxEdge: 1024, temperature: 0 };

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
  run: null,
});

// An item the surveyed experiment has answered, at the version given.
const ranUnder = (stem: string, version: string | undefined): SurveyedItem => ({
  ...item(stem, null, [BASELINE]),
  run: {
    ranAt: 'now',
    version,
    parameters: PARAMETERS,
    fields: { naked: true },
  },
});

const byHuman = (value: FieldValue): Labels => ({ naked: value });

// Every field answered by a person. `confirmed` turns on the whole set, so a
// fixture naming one field stops meaning "answered" the moment another field
// is added.
const everyField = (): Labels =>
  Object.fromEntries(FIELDS.map((f) => [f.id, f.options[0]!.value]));

// An item with no labels that the selected experiment has answered — the state
// a run leaves behind, now that a run writes nothing into the ground truth.
const proposed = (stem: string, value: boolean): SurveyedItem => ({
  ...item(stem, null, [BASELINE]),
  run: {
    ranAt: 'now',
    version: NOW,
    parameters: PARAMETERS,
    fields: { naked: value },
  },
});

describe('summarise', () => {
  it('counts the corpus and splits it by kind', () => {
    const summary = summarise(
      [item('a'), item('b'), { ...item('c'), kind: 'video' }],
      NOW,
    );
    expect(summary).toMatchObject({ total: 3, images: 2, videos: 1 });
  });

  it('counts an item confirmed when a person answered every field', () => {
    expect(summarise([item('a', everyField())], NOW).confirmed).toBe(1);
  });

  it('does not count an item confirmed while a field is unanswered', () => {
    const missing = everyField();
    delete missing[FIELDS[0]!.id];
    expect(summarise([item('a', missing)], NOW).confirmed).toBe(0);
  });

  it('counts an item answered Unknown as confirmed, since it was answered', () => {
    const labels = everyField();
    labels.naked = UNKNOWN;
    expect(summarise([item('a', labels)], NOW).confirmed).toBe(1);
  });

  it('does not count an item only the experiment has answered as confirmed', () => {
    expect(summarise([proposed('a', true)], NOW).confirmed).toBe(0);
  });

  it('counts an item nothing has answered as untouched', () => {
    expect(summarise([item('a'), item('b', {})], NOW).untouched).toBe(2);
  });

  it('does not count an item the experiment has answered as untouched — it is work outstanding', () => {
    expect(summarise([proposed('a', true)], NOW).untouched).toBe(0);
  });

  it('tallies how many items each experiment has answered', () => {
    expect(
      summarise(
        [
          item('a', null, [BASELINE]),
          item('b', null, [BASELINE, '2026-09-01-nudenet']),
        ],
        NOW,
      ).runs,
    ).toEqual({ [BASELINE]: 2, '2026-09-01-nudenet': 1 });
  });

  it('counts a result the experiment has since been edited past as outdated', () => {
    expect(summarise([ranUnder('a', BEFORE)], NOW).outdated).toBe(1);
  });

  it('does not count a result the experiment would still produce', () => {
    expect(summarise([ranUnder('a', NOW)], NOW).outdated).toBe(0);
  });

  it('counts a result stamped with no version as outdated', () => {
    expect(summarise([ranUnder('a', undefined)], NOW).outdated).toBe(1);
  });

  it('counts nothing outdated for an item the experiment never answered', () => {
    expect(summarise([item('a')], NOW).outdated).toBe(0);
  });

  it("splits a field's answers into confirmed and seeded", () => {
    const summary = summarise(
      [
        item('a', byHuman(true)),
        item('b', byHuman(false)),
        proposed('c', true),
      ],
      NOW,
    );
    expect(summary.fields[0]).toMatchObject({
      id: 'naked',
      confirmed: 2,
      seeded: 1,
    });
  });

  it('does not count a field as seeded once a person has answered it', () => {
    const answered: SurveyedItem = {
      ...proposed('a', true),
      labels: byHuman(false),
      hasLabels: true,
    };
    expect(summarise([answered], NOW).fields[0]).toMatchObject({
      confirmed: 1,
      seeded: 0,
    });
  });

  it('spreads the confirmed answers across the options', () => {
    const summary = summarise(
      [
        item('a', byHuman(true)),
        item('b', byHuman(true)),
        item('c', byHuman(false)),
      ],
      NOW,
    );
    expect(summary.fields[0]?.values).toContainEqual({
      label: 'Yes',
      count: 2,
    });
    expect(summary.fields[0]?.values).toContainEqual({ label: 'No', count: 1 });
  });

  it('lists an option nothing was labelled with at nought', () => {
    expect(
      summarise([item('a', byHuman(true))], NOW).fields[0]?.values,
    ).toContainEqual({ label: 'No', count: 0 });
  });

  it('shows a value no option covers rather than dropping it', () => {
    const summary = summarise([item('a', { naked: 'sort of' })], NOW);
    expect(summary.fields[0]?.values).toContainEqual({
      label: 'sort of',
      count: 1,
    });
  });

  it('counts nothing over an empty corpus', () => {
    expect(summarise([], NOW)).toMatchObject({
      total: 0,
      confirmed: 0,
      untouched: 0,
      outdated: 0,
      runs: {},
    });
  });
});
