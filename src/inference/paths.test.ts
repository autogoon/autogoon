// What a corpus filename means. readName is the only reader of the layout, so
// the ambiguous cases — a stem with dots in it, a name that looks like a run
// but isn't — are pinned here rather than discovered against a real directory.

import { describe, expect, it } from '@jest/globals';
import {
  fieldsName,
  labelsName,
  promptName,
  rawName,
  readName,
  runAt,
  sidecarName,
} from './paths';

const BASELINE = '2026-08-02-baseline';
const STAMP = { at: '20260803154212', version: '5a4919b862f2' };

describe('readName', () => {
  it('reads a picture as media, carrying its kind', () => {
    expect(readName('beach.jpg')).toEqual({
      what: 'media',
      stem: 'beach',
      file: 'beach.jpg',
      kind: 'image',
    });
  });

  it('reads a video as media, since the corpus holds what a pack could', () => {
    expect(readName('clip.mp4')).toMatchObject({
      what: 'media',
      kind: 'video',
    });
  });

  it('matches a media extension whatever its case', () => {
    expect(readName('Beach.JPG')).toMatchObject({
      what: 'media',
      stem: 'Beach',
    });
  });

  it('reads ground truth', () => {
    expect(readName('beach.labels.json')).toEqual({
      what: 'labels',
      stem: 'beach',
    });
  });

  it("reads a run's answers, splitting the experiment off the stem", () => {
    expect(readName('beach.2026-08-02-baseline.fields.json')).toEqual({
      what: 'fields',
      stem: 'beach',
      experiment: '2026-08-02-baseline',
    });
  });

  it("reads a run's raw reply, as the first call's", () => {
    expect(readName('beach.2026-08-02-baseline.raw.txt')).toEqual({
      what: 'raw',
      at: 1,
      stem: 'beach',
      experiment: '2026-08-02-baseline',
    });
  });

  it('keeps the dots in a stem that has them', () => {
    expect(readName('beach.holiday.jpg')).toMatchObject({
      stem: 'beach.holiday',
    });
    expect(readName('beach.holiday.labels.json')).toEqual({
      what: 'labels',
      stem: 'beach.holiday',
    });
    expect(readName('beach.holiday.2026-08-02-baseline.fields.json')).toEqual({
      what: 'fields',
      stem: 'beach.holiday',
      experiment: '2026-08-02-baseline',
    });
  });

  it('refuses a fields name whose experiment segment is not an id', () => {
    expect(readName('beach.whenever.fields.json')).toBeNull();
  });

  it('reads the sidecar an experiment wrote, which carries its id', () => {
    expect(readName('beach.2026-08-02-baseline.sidecar.md')).toEqual({
      what: 'sidecar',
      stem: 'beach',
      experiment: '2026-08-02-baseline',
    });
  });

  it("leaves the pack's own sidecar alone, since it names no experiment", () => {
    expect(readName('beach.md')).toBeNull();
  });

  it('reads the prompt a run sent', () => {
    expect(readName(`beach.${BASELINE}.prompt.txt`)).toEqual({
      what: 'prompt',
      at: 1,
      stem: 'beach',
      experiment: BASELINE,
    });
  });

  it('reads a later call by the number its files carry', () => {
    expect(readName(`beach.${BASELINE}.raw2.txt`)).toMatchObject({
      what: 'raw',
      at: 2,
      stem: 'beach',
    });
    expect(readName(`beach.${BASELINE}.prompt2.txt`)).toMatchObject({
      what: 'prompt',
      at: 2,
    });
  });

  it('reads a call past the ninth, which is two digits', () => {
    expect(readName(`beach.${BASELINE}.raw12.txt`)).toMatchObject({ at: 12 });
  });

  it('refuses a number the first call would never carry', () => {
    expect(readName(`beach.${BASELINE}.raw1.txt`)).toBeNull();
    expect(readName(`beach.${BASELINE}.raw0.txt`)).toBeNull();
  });

  it('reads an archived file as the run that wrote it', () => {
    expect(
      readName(`beach.${BASELINE}.20260803154212.5a4919b862f2.raw.txt`),
    ).toEqual({
      what: 'raw',
      at: 1,
      stem: 'beach',
      experiment: BASELINE,
      run: STAMP,
    });
  });

  it('leaves the latest with no run of its own, which is what marks it latest', () => {
    expect(readName(`beach.${BASELINE}.raw.txt`)).not.toHaveProperty('run');
  });

  it('keeps the dots in a stem an archived name carries', () => {
    expect(
      readName(
        `beach.holiday.${BASELINE}.20260803154212.5a4919b862f2.fields.json`,
      ),
    ).toMatchObject({ stem: 'beach.holiday', run: STAMP });
  });

  it('refuses an archived name whose time is not a timestamp', () => {
    expect(
      readName(`beach.${BASELINE}.yesterday.5a4919b862f2.raw.txt`),
    ).toBeNull();
  });

  it('refuses an archived name whose version is not a hash', () => {
    expect(
      readName(`beach.${BASELINE}.20260803154212.yesterday.raw.txt`),
    ).toBeNull();
  });

  it('refuses an archived name with the two segments the wrong way round', () => {
    expect(
      readName(`beach.${BASELINE}.5a4919b862f2.20260803154212.raw.txt`),
    ).toBeNull();
  });

  it('ignores a file the corpus has no use for', () => {
    expect(readName('.DS_Store')).toBeNull();
    expect(readName('notes.txt')).toBeNull();
    expect(readName('README')).toBeNull();
  });
});

describe('labelsName', () => {
  it('round-trips through readName', () => {
    expect(readName(labelsName('beach.holiday'))).toEqual({
      what: 'labels',
      stem: 'beach.holiday',
    });
  });
});

describe('fieldsName', () => {
  it('round-trips through readName', () => {
    expect(readName(fieldsName('beach', '2026-08-02-baseline'))).toEqual({
      what: 'fields',
      stem: 'beach',
      experiment: '2026-08-02-baseline',
    });
  });
});

describe('rawName', () => {
  it('round-trips through readName', () => {
    expect(readName(rawName('beach', '2026-08-02-baseline'))).toEqual({
      what: 'raw',
      at: 1,
      stem: 'beach',
      experiment: '2026-08-02-baseline',
    });
  });
});

describe('sidecarName', () => {
  it('round-trips through readName', () => {
    expect(readName(sidecarName('beach', '2026-08-02-baseline'))).toEqual({
      what: 'sidecar',
      stem: 'beach',
      experiment: '2026-08-02-baseline',
    });
  });

  it('round-trips an archived name through readName', () => {
    expect(readName(sidecarName('beach', BASELINE, STAMP))).toEqual({
      what: 'sidecar',
      stem: 'beach',
      experiment: BASELINE,
      run: STAMP,
    });
  });
});

describe('promptName', () => {
  it('round-trips through readName', () => {
    expect(readName(promptName('beach', BASELINE))).toEqual({
      what: 'prompt',
      at: 1,
      stem: 'beach',
      experiment: BASELINE,
    });
  });

  it('leaves the first call unnumbered, so one call writes the plain name', () => {
    expect(promptName('beach', BASELINE)).toBe(`beach.${BASELINE}.prompt.txt`);
    expect(rawName('beach', BASELINE)).toBe(`beach.${BASELINE}.raw.txt`);
  });

  it('round-trips a later call, archived, through readName', () => {
    expect(readName(promptName('beach', BASELINE, 3, STAMP))).toEqual({
      what: 'prompt',
      at: 3,
      stem: 'beach',
      experiment: BASELINE,
      run: STAMP,
    });
  });
});

describe('runAt', () => {
  it("names the moment a record's ranAt does, without a path's forbidden characters", () => {
    expect(runAt('2026-08-03T15:42:12.345Z')).toBe('20260803154212');
  });

  it('sorts two moments in the order they happened', () => {
    expect(
      runAt('2026-08-03T09:00:00.000Z') < runAt('2026-08-03T15:42:12.345Z'),
    ).toBe(true);
  });
});
