// The two pure parts of the pack listing: what makes a media directory a
// corpus, and what a request is allowed to name. The readdirs around them are
// exercised by running the tool — this file covers the decisions.

import { describe, expect, it } from '@jest/globals';
import { countItems, readPack } from './packs';

const request = (query: string): Request =>
  new Request(`http://localhost/api/inference/items${query}`);

describe('countItems', () => {
  it('counts the media a directory holds', () => {
    expect(countItems(['beach.jpg', 'pier.png', 'reel.mp4'])).toBe(3);
  });

  it('leaves out the working files an item accumulates beside its picture', () => {
    expect(
      countItems([
        'beach.jpg',
        'beach.labels.json',
        'beach.2026-08-02-baseline.fields.json',
        'beach.2026-08-02-baseline.raw.txt',
        '2026-08-02-baseline.run.json',
      ]),
    ).toBe(1);
  });

  it("leaves out a pack's own sidecars, which name no item of their own", () => {
    expect(countItems(['beach.jpg', 'beach.md'])).toBe(1);
  });

  it('answers zero for a directory holding nothing that plays', () => {
    expect(countItems(['.DS_Store', 'notes.txt'])).toBe(0);
  });
});

describe('readPack', () => {
  it('answers the pack the request names when the listing holds it', () => {
    expect(readPack(request('?pack=elise'), ['aimee', 'elise'])).toBe('elise');
  });

  it('refuses a pack the listing does not hold', () => {
    expect(() => readPack(request('?pack=gone'), ['elise'])).toThrow('gone');
  });

  it('refuses a traversal, which no listing spells', () => {
    expect(() => readPack(request('?pack=..%2F..%2Fetc'), ['elise'])).toThrow();
  });

  it('refuses a request naming no pack at all', () => {
    expect(() => readPack(request(''), ['elise'])).toThrow();
  });
});
