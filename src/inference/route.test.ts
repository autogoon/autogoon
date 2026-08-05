// The Inference tab's sub-routing. What it has to get right is that a stem
// survives the trip out to a URL and back: stems are corpus filenames, so they
// carry dots, spaces and whatever else a directory allows.

import { describe, expect, it } from '@jest/globals';
import { readRoute, routeHash } from './route';

const PACK = 'elise';
const BASELINE = '2026-08-02-baseline';

describe('readRoute', () => {
  it('reads the summary, with neither pack nor experiment chosen yet', () => {
    expect(readRoute('#inference')).toEqual({
      pack: '',
      experiment: '',
      stem: null,
    });
  });

  it('reads a pack named without an experiment', () => {
    expect(readRoute(`#inference/${PACK}`)).toEqual({
      pack: PACK,
      experiment: '',
      stem: null,
    });
  });

  it('reads the pack and experiment the summary is showing', () => {
    expect(readRoute(`#inference/${PACK}/${BASELINE}`)).toEqual({
      pack: PACK,
      experiment: BASELINE,
      stem: null,
    });
  });

  it('reads the item open for review', () => {
    expect(readRoute(`#inference/${PACK}/${BASELINE}/beach`).stem).toBe(
      'beach',
    );
  });

  it('answers nothing for a hash belonging to another screen', () => {
    expect(readRoute('#settings')).toEqual({
      pack: '',
      experiment: '',
      stem: null,
    });
  });
});

describe('routeHash', () => {
  it('round-trips a stem holding dots, as a media filename does', () => {
    const stem = 'beach.holiday.2';
    expect(readRoute(routeHash(PACK, BASELINE, stem)).stem).toBe(stem);
  });

  it('round-trips a stem holding a space and a hash', () => {
    const stem = 'a picture #2';
    expect(readRoute(routeHash(PACK, BASELINE, stem)).stem).toBe(stem);
  });

  it('round-trips a stem holding a slash, which a URL would otherwise split', () => {
    const stem = 'one/two';
    expect(readRoute(routeHash(PACK, BASELINE, stem)).stem).toBe(stem);
  });

  it('round-trips a pack name holding a space', () => {
    const pack = 'a pack';
    expect(readRoute(routeHash(pack, BASELINE)).pack).toBe(pack);
  });

  it('names the summary when given no stem', () => {
    expect(routeHash(PACK, BASELINE)).toBe(`#inference/${PACK}/${BASELINE}`);
  });
});
