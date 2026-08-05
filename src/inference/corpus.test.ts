// Grouping a directory listing into the corpus. This is the whole of what the
// tool knows about its own state, derived from names alone — so the cases that
// matter are the ones where a name is there and the file it describes isn't.

import { describe, expect, it } from '@jest/globals';
import { groupNames } from './corpus';

const BASELINE = '2026-08-02-baseline';

describe('groupNames', () => {
  it('finds an item from its media file alone', () => {
    expect(groupNames(['beach.jpg'])).toEqual([
      {
        stem: 'beach',
        file: 'beach.jpg',
        kind: 'image',
        hasLabels: false,
        runs: [],
      },
    ]);
  });

  it('marks an item whose ground truth exists', () => {
    expect(groupNames(['beach.jpg', 'beach.labels.json'])[0]).toMatchObject({
      hasLabels: true,
    });
  });

  it('lists the experiments that have answered an item', () => {
    expect(
      groupNames([
        'beach.jpg',
        `beach.${BASELINE}.fields.json`,
        'beach.2026-09-01-nudenet.fields.json',
      ])[0],
    ).toMatchObject({ runs: [BASELINE, '2026-09-01-nudenet'] });
  });

  it('does not count a raw reply as an answer, since only fields are scored', () => {
    expect(
      groupNames(['beach.jpg', `beach.${BASELINE}.raw.txt`])[0],
    ).toMatchObject({ runs: [] });
  });

  it('does not count an archived answer, which an experiment has since replaced', () => {
    expect(
      groupNames([
        'beach.jpg',
        `beach.${BASELINE}.20260803154212.5a4919b862f2.fields.json`,
      ])[0],
    ).toMatchObject({ runs: [] });
  });

  it('drops a labels file whose media is gone', () => {
    expect(groupNames(['beach.labels.json'])).toEqual([]);
  });

  it('ignores a file the corpus has no use for', () => {
    expect(groupNames(['beach.jpg', '.DS_Store', 'notes.txt'])).toHaveLength(1);
  });

  it('sorts by stem, so stepping through the corpus is stable', () => {
    expect(
      groupNames(['cliff.jpg', 'beach.jpg', 'attic.jpg']).map((i) => i.stem),
    ).toEqual(['attic', 'beach', 'cliff']);
  });

  it('keeps an item whose stem contains dots together with its labels', () => {
    expect(
      groupNames(['beach.holiday.jpg', 'beach.holiday.labels.json']),
    ).toEqual([
      {
        stem: 'beach.holiday',
        file: 'beach.holiday.jpg',
        kind: 'image',
        hasLabels: true,
        runs: [],
      },
    ]);
  });
});
