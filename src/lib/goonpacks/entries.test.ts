import { describe, expect, it } from '@jest/globals';
import { companionList } from '@/lib/companions/companions';
import {
  buildEntries,
  describeMedia,
  effectiveMedia,
  keyId,
  keyVersion,
  newestFirst,
  packKey,
  publisher,
  type LoadedPack,
} from './entries';
import type { PackManifest } from './manifest';

// Fixture extras split the way the manifest does: `top` spreads into the
// pack level, `companion` into the companion section.
type Extra = { top?: object; companion?: object };
const manifest = (
  id: string,
  version: string,
  e: Extra = {},
): PackManifest => ({
  format: 2,
  id,
  version,
  aboutThePack: 'a test pack',
  companion: e.companion ?? {},
  ...e.top,
});
const NO_EXTRAS = { media: { images: 0, clips: 0 }, hasPrompt: false };
const complete = (
  id: string,
  version: string,
  e: Extra = {},
  summary = NO_EXTRAS,
): LoadedPack => ({
  manifest: manifest(id, version, {
    top: e.top,
    companion: { name: 'Comp', voiceId: 'v', ...e.companion },
  }),
  summary,
});
const overlay = (
  id: string,
  version: string,
  base: string,
  e: Extra = {},
  summary = NO_EXTRAS,
): LoadedPack => ({
  manifest: manifest(id, version, {
    top: { base, ...e.top },
    companion: e.companion,
  }),
  summary,
});

// Built-in ids in picker order, for asserting built-ins stay first and
// alphabetical (companionList's own order — see companions.ts).
const BUILT_IN_IDS = companionList.map((c) => c.id);

describe('keys', () => {
  it('round-trips id and version', () => {
    expect(packKey({ id: 'g00ner.aimee', version: '1.0.0' })).toBe(
      'g00ner.aimee@1.0.0',
    );
    expect(keyId('g00ner.aimee@1.0.0')).toBe('g00ner.aimee');
    expect(keyVersion('g00ner.aimee@1.0.0')).toBe('1.0.0');
  });
  it('sorts versions newest first, digits compared as numbers', () => {
    expect(['1.9.0', '1.10.0', '2.0.0'].sort(newestFirst)).toEqual([
      '2.0.0',
      '1.10.0',
      '1.9.0',
    ]);
  });
});

describe('publisher', () => {
  it('reads the half before the dot', () => {
    expect(publisher('g00ner.aimee')).toBe('g00ner');
  });
});

describe('effectiveMedia', () => {
  const none = { images: 0, clips: 0 };
  const opt = (extra: object) => ({
    key: 'pub.o@1',
    label: 'pub',
    media: none,
    changed: [],
    ...extra,
  });
  it("no overlay, or a medialess overlay, plays the base's set", () => {
    expect(effectiveMedia(null, { images: 9, clips: 1 })).toEqual({
      images: 9,
      clips: 1,
    });
    expect(effectiveMedia(opt({}), { images: 9, clips: 1 })).toEqual({
      images: 9,
      clips: 1,
    });
  });
  it("an overlay's own set wins; noMedia strips to zero", () => {
    expect(
      effectiveMedia(opt({ media: { images: 4, clips: 2 } }), {
        images: 9,
        clips: 0,
      }),
    ).toEqual({ images: 4, clips: 2 });
    expect(
      effectiveMedia(opt({ noMedia: true }), { images: 9, clips: 0 }),
    ).toEqual(none);
  });
});

describe('describeMedia', () => {
  it('names stills and clips separately, singular and plural', () => {
    expect(describeMedia({ images: 0, clips: 0 })).toBe('');
    expect(describeMedia({ images: 1, clips: 0 })).toBe('1 picture');
    expect(describeMedia({ images: 3, clips: 0 })).toBe('3 pictures');
    expect(describeMedia({ images: 0, clips: 1 })).toBe('1 clip');
    expect(describeMedia({ images: 3, clips: 2 })).toBe('3 pictures · 2 clips');
  });
});

describe('buildEntries', () => {
  it('no packs: built-ins with one default base and no overlays', () => {
    const entries = buildEntries([]);
    expect(entries.map((e) => e.companion.id)).toEqual(BUILT_IN_IDS);
    for (const e of entries) {
      expect(e.builtIn).toBe(true);
      expect(e.bases).toEqual([
        {
          key: null,
          label: 'default',
          media: { images: 0, clips: 0 },
          changed: [],
        },
      ]);
      expect(e.overlays).toEqual([]);
    }
  });

  it("a complete pack's versions share one entry, newest first", () => {
    const packs = [
      complete(
        'pub.comp',
        '1.0.0',
        { companion: { description: 'old' } },
        { media: { images: 3, clips: 0 }, hasPrompt: true },
      ),
      complete(
        'pub.comp',
        '1.10.0',
        { companion: { description: 'new' } },
        { media: { images: 5, clips: 0 }, hasPrompt: true },
      ),
    ];
    const entries = buildEntries(packs);
    expect(entries).toHaveLength(BUILT_IN_IDS.length + 1);
    const entry = entries.find((e) => e.companion.id === 'pub.comp')!;
    expect(entry.builtIn).toBe(false);
    // The card's identity follows the newest version.
    expect(entry.companion.description).toBe('new');
    expect(entry.bases.map((b) => b.key)).toEqual([
      'pub.comp@1.10.0',
      'pub.comp@1.0.0',
    ]);
    expect(entry.bases[0]).toMatchObject({
      label: 'pub',
      version: '1.10.0',
      media: { images: 5, clips: 0 },
    });
    expect(entry.overlays).toEqual([]);
  });

  it('overlay versions list newest first with their changed slots', () => {
    const base = BUILT_IN_IDS[0]!;
    const packs = [
      overlay('pub.goth', '1.0.0', base, { companion: { voiceId: 'v1' } }),
      overlay(
        'pub.goth',
        '1.1.0',
        base,
        { companion: { voiceId: 'v2', accentColour: 'violet' } },
        { media: { images: 4, clips: 0 }, hasPrompt: false },
      ),
    ];
    const entry = buildEntries(packs).find((e) => e.companion.id === base)!;
    expect(entry.overlays.map((o) => o.key)).toEqual([
      'pub.goth@1.1.0',
      'pub.goth@1.0.0',
    ]);
    expect(entry.overlays[0]).toMatchObject({
      accent: 'violet',
      media: { images: 4, clips: 0 },
      changed: ['media', 'voice', 'colour'],
    });
    expect(entry.overlays[1]!.changed).toEqual(['voice']);
  });

  it('noMedia flags the overlay option', () => {
    const base = BUILT_IN_IDS[0]!;
    const entry = buildEntries([
      overlay('pub.quiet', '1.0.0', base, { top: { noMedia: true } }),
    ]).find((e) => e.companion.id === base)!;
    expect(entry.overlays[0]).toMatchObject({
      noMedia: true,
      changed: ['media'],
    });
  });

  it('overlays on a complete pack attach to its entry', () => {
    const packs = [
      complete(
        'pub.comp',
        '1.0.0',
        {},
        { media: { images: 7, clips: 0 }, hasPrompt: true },
      ),
      overlay('pub.voice', '1.0.0', 'pub.comp', {
        companion: { voiceId: 'v2' },
      }),
    ];
    const entry = buildEntries(packs).find(
      (e) => e.companion.id === 'pub.comp',
    )!;
    expect(entry.overlays.map((o) => o.key)).toEqual(['pub.voice@1.0.0']);
    // A medialess overlay inherits the selected base version's set.
    expect(effectiveMedia(entry.overlays[0]!, entry.bases[0]!.media)).toEqual({
      images: 7,
      clips: 0,
    });
  });
});
