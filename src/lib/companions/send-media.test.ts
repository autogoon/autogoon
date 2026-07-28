// What the model is offered and what a choice resolves to. The tool's schema
// and the lightbox it opens are the panel's (companions-panel/index.tsx); the
// dialect a choice arrives in when the model writes the call out as text is
// textual-tool-calls.test.ts's.
import { describe, expect, it } from '@jest/globals';
import type { CompanionMedia } from './companions';
import { describeMediaList, pickMedia } from './send-media';

const item = (
  kind: CompanionMedia['kind'],
  caption: string,
): CompanionMedia => ({
  kind,
  caption,
  description: `${caption}, at length`,
  ref: `goonpack:pub.pack@1.0.0/${caption}`,
  load: () => Promise.resolve('blob:x'),
  forget: () => {},
});

const ITEMS = [
  item('image', 'on the beach'),
  item('video', 'dancing'),
  item('image', 'in the mirror'),
];

describe('describeMediaList', () => {
  it('numbers the items from 1, marking each a picture or a video', () => {
    expect(describeMediaList(ITEMS)).toBe(
      '1 — (picture) on the beach\n2 — (video) dancing\n3 — (picture) in the mirror',
    );
  });
});

describe('pickMedia', () => {
  it('resolves a number to the item describeMediaList gave it', () => {
    const pick = pickMedia(ITEMS, { which: 2 });
    expect(pick.show).toBe(ITEMS[1]);
    expect(pick.sent).toEqual({
      result: 'Sent him the video: dancing',
      mediaRef: ITEMS[1]!.ref,
    });
  });

  it('clamps a number past either end of the list to the nearest item', () => {
    expect(pickMedia(ITEMS, { which: 0 }).show).toBe(ITEMS[0]);
    expect(pickMedia(ITEMS, { which: 99 }).show).toBe(ITEMS[2]);
  });

  it('sends the first item for a which that is not a number at all', () => {
    // A model that writes the call out as text can produce anything here, and
    // the schema does not stop it — sending something beats failing the call.
    expect(pickMedia(ITEMS, { which: 'the red one' }).show).toBe(ITEMS[0]);
    expect(pickMedia(ITEMS, {}).show).toBe(ITEMS[0]);
    expect(pickMedia(ITEMS, { which: Number.NaN }).show).toBe(ITEMS[0]);
  });

  it('refuses a kind that disagrees with the number, showing nothing and naming both', () => {
    const pick = pickMedia(ITEMS, { which: 2, kind: 'picture' });
    expect(pick.show).toBeNull();
    expect(pick.sent).toBe(
      'number 2 is a video, not a picture — check the list and pick again',
    );
  });

  it('names the number it clamped to when refusing, not the one it was given', () => {
    const pick = pickMedia(ITEMS, { which: 99, kind: 'video' });
    expect(pick.sent).toBe(
      'number 3 is a picture, not a video — check the list and pick again',
    );
  });

  it('sends the item when the stated kind agrees with the number', () => {
    expect(pickMedia(ITEMS, { which: 2, kind: 'video' }).show).toBe(ITEMS[1]);
  });

  it('sends the item when no kind is stated at all', () => {
    expect(pickMedia(ITEMS, { which: 2 }).show).toBe(ITEMS[1]);
  });
});
