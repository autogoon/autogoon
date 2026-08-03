// What a corpus filename means. readName is the only reader of the layout, so
// the ambiguous cases — a stem with dots in it, a name that looks like a run
// but isn't — are pinned here rather than discovered against a real directory.

import { describe, expect, it } from '@jest/globals';
import {
  fieldsName,
  labelsName,
  rawName,
  readName,
  sidecarName,
} from './paths';

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

  it("reads a run's raw reply", () => {
    expect(readName('beach.2026-08-02-baseline.raw.txt')).toEqual({
      what: 'raw',
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
});
