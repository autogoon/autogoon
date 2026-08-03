// The Inference tab's sub-routing. What it has to get right is that a stem
// survives the trip out to a URL and back: stems are corpus filenames, so they
// carry dots, spaces and whatever else a directory allows.

import { describe, expect, it } from '@jest/globals';
import { readRoute, routeHash } from './route';

const BASELINE = '2026-08-02-baseline';

describe('readRoute', () => {
  it('reads the summary, with no experiment chosen yet', () => {
    expect(readRoute('#inference')).toEqual({ experiment: '', stem: null });
  });

  it('reads the experiment the summary is showing', () => {
    expect(readRoute(`#inference/${BASELINE}`)).toEqual({
      experiment: BASELINE,
      stem: null,
    });
  });

  it('reads the item open for review', () => {
    expect(readRoute(`#inference/${BASELINE}/beach`).stem).toBe('beach');
  });

  it('answers nothing for a hash belonging to another screen', () => {
    expect(readRoute('#settings')).toEqual({ experiment: '', stem: null });
  });
});

describe('routeHash', () => {
  it('round-trips a stem holding dots, as a media filename does', () => {
    const stem = 'beach.holiday.2';
    expect(readRoute(routeHash(BASELINE, stem)).stem).toBe(stem);
  });

  it('round-trips a stem holding a space and a hash', () => {
    const stem = 'a picture #2';
    expect(readRoute(routeHash(BASELINE, stem)).stem).toBe(stem);
  });

  it('round-trips a stem holding a slash, which a URL would otherwise split', () => {
    const stem = 'one/two';
    expect(readRoute(routeHash(BASELINE, stem)).stem).toBe(stem);
  });

  it('names the summary when given no stem', () => {
    expect(routeHash(BASELINE)).toBe(`#inference/${BASELINE}`);
  });
});
