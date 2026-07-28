// How a search result reads back to the model, and what a ref resolves to. The
// tools' schemas and the lightbox a send opens are the panel's
// (companions-panel/index.tsx); the dialect a call arrives in when the model
// writes it out as text is textual-tool-calls.test.ts's.
import { describe, expect, it } from '@jest/globals';
import type { CompanionMedia } from './companions';
import { countHits, describeHits, pickMedia } from './send-media';

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

const ITEMS = [item('image', 'on the beach'), item('video', 'dancing')];

describe('pickMedia', () => {
  it('shows the item whose ref was asked for and reports what went', () => {
    const pick = pickMedia(ITEMS, { ref: ITEMS[1]!.ref });
    expect(pick.show).toBe(ITEMS[1]);
    expect(pick.sent).toEqual({
      result: 'Sent him the video: dancing',
      mediaRef: ITEMS[1]!.ref,
    });
  });

  it('sends nothing for a ref that is not in the set, and says to search first', () => {
    const pick = pickMedia(ITEMS, { ref: 'goonpack:pub.pack@1.0.0/invented' });
    expect(pick.show).toBeNull();
    expect(pick.sent).toMatch(/search_media/);
  });

  it('sends nothing when the ref is missing rather than standing something in', () => {
    // A model that writes the call out as text can produce anything here, and
    // the schema does not stop it. With an index a wrong number still meant a
    // picture, so standing one in was the kinder failure; a ref is either
    // theirs or invented.
    expect(pickMedia(ITEMS, {}).show).toBeNull();
    expect(pickMedia(ITEMS, { ref: '' }).show).toBeNull();
    expect(pickMedia(ITEMS, { ref: 7 }).show).toBeNull();
  });
});

describe('describeHits', () => {
  it('gives one line per hit, each carrying the ref that sends it', () => {
    expect(
      describeHits(
        ITEMS.map((m) => ({ ref: m.ref, caption: m.caption, kind: m.kind })),
      ),
    ).toBe(
      'goonpack:pub.pack@1.0.0/on the beach — (picture) on the beach\n' +
        'goonpack:pub.pack@1.0.0/dancing — (video) dancing',
    );
  });

  it('says nothing matched rather than returning an empty list', () => {
    expect(describeHits([])).toMatch(/nothing/i);
  });
});

describe('countHits', () => {
  const hit = (ref: string) => ({
    ref,
    caption: 'on the beach',
    kind: 'image' as const,
  });

  it('counts the hits rather than naming any of them', () => {
    expect(countHits([hit('a'), hit('b'), hit('c')])).toBe('3 matches');
    expect(countHits([])).toBe('0 matches');
  });

  it('says match rather than matches for a single hit', () => {
    expect(countHits([hit('a')])).toBe('1 match');
  });
});
