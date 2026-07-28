// What a request in a companion's own words finds in their media. The tool
// schema over it, and the sentence a hit reads back as, are the panel's and
// send-media's.
import { describe, expect, it } from '@jest/globals';
import type { CompanionMedia } from './companions';
import { SEARCH_LIMIT, searchMedia } from './media-search';

const item = (
  ref: string,
  caption: string,
  description = '',
  kind: CompanionMedia['kind'] = 'image',
): CompanionMedia => ({
  kind,
  caption,
  description,
  ref,
  load: () => Promise.resolve('blob:x'),
  forget: () => {},
});

const SET = [
  item('a', 'A woman kneeling on a bed, looking up.'),
  item('b', 'A woman standing on a beach at sunset.'),
  item('c', 'A woman sitting in a car.', 'There is a mirror behind her.'),
  item('d', 'A woman dancing on a beach.', '', 'video'),
];

describe('searchMedia', () => {
  it('ranks the item whose caption shares most with the request first', () => {
    expect(searchMedia(SET, 'kneeling looking up')[0]?.ref).toBe('a');
  });

  it('finds an item on detail that only its long description carries', () => {
    expect(searchMedia(SET, 'mirror')[0]?.ref).toBe('c');
  });

  it('ranks a caption hit above a description hit for the same word', () => {
    const beach = item('e', 'A woman indoors.', 'Behind her is a beach.');
    const hits = searchMedia([beach, SET[1]!], 'beach');
    expect(hits.map((h) => h.ref)).toEqual(['b', 'e']);
  });

  it('returns nothing when no item shares anything with the request', () => {
    expect(searchMedia(SET, 'helicopter')).toEqual([]);
  });

  it('returns nothing for a request that is all words too common to tell items apart', () => {
    expect(searchMedia(SET, 'she is on the')).toEqual([]);
  });

  it('leaves out the items it was told to exclude', () => {
    const hits = searchMedia(SET, 'woman', {
      exclude: new Set(['a', 'b', 'd']),
    });
    expect(hits.map((h) => h.ref)).toEqual(['c']);
  });

  it('narrows to one kind when asked for one, keeping both when not', () => {
    expect(searchMedia(SET, 'beach', { kind: 'video' })[0]?.ref).toBe('d');
    expect(searchMedia(SET, 'beach', { kind: 'image' })[0]?.ref).toBe('b');
    expect(searchMedia(SET, 'beach')).toHaveLength(2);
  });

  it('hands back at most SEARCH_LIMIT matches however many the set holds', () => {
    const many = Array.from({ length: SEARCH_LIMIT + 5 }, (_, n) =>
      item(`x${n}`, 'A woman on a beach.'),
    );
    expect(searchMedia(many, 'beach')).toHaveLength(SEARCH_LIMIT);
  });

  it('orders equally-scoring items the same way every time', () => {
    expect(searchMedia(SET, 'woman').map((h) => h.ref)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('carries the caption and kind of each hit, which is what the model reads', () => {
    const hit = searchMedia(SET, 'sunset')[0];
    expect(hit?.caption).toBe('A woman standing on a beach at sunset.');
    expect(hit?.kind).toBe('image');
  });
});
