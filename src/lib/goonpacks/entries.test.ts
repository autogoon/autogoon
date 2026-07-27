import { describe, expect, it } from '@jest/globals';
import { companionList } from '@/lib/companions/companions';
import {
  buildEntries,
  countMedia,
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
const NO_EXTRAS = { media: { images: 0, videos: 0 }, hasPrompt: false };
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

// companionList's own order (see companions.ts). buildEntries maps over that
// list, so the built-in entries come out in exactly this sequence.
const BUILT_IN_IDS = companionList.map((c) => c.id);

describe('pack keys', () => {
  it('packKey joins id and version with "@"; keyId and keyVersion read them back', () => {
    expect(packKey({ id: 'g00ner.aimee', version: '1.0.0' })).toBe(
      'g00ner.aimee@1.0.0',
    );
    expect(keyId('g00ner.aimee@1.0.0')).toBe('g00ner.aimee');
    expect(keyVersion('g00ner.aimee@1.0.0')).toBe('1.0.0');
  });
  // A version is free text parseManifest checks only for being text, while
  // PACK_ID_RE forbids "@" in an id, so the only "@" that splits the key
  // is the first one — every later one belongs to the version.
  it('keyVersion returns everything after the first "@", so a version containing "@" survives', () => {
    expect(keyVersion('pub.pack@2.0@beta')).toBe('2.0@beta');
    expect(keyId('pub.pack@2.0@beta')).toBe('pub.pack');
  });
  it('newestFirst sorts versions newest first, digits compared as numbers', () => {
    expect(['1.9.0', '1.10.0', '2.0.0'].sort(newestFirst)).toEqual([
      '2.0.0',
      '1.10.0',
      '1.9.0',
    ]);
  });
});

describe('publisher', () => {
  it('returns the segment of a pack id before the dot', () => {
    expect(publisher('g00ner.aimee')).toBe('g00ner');
  });
});

describe('countMedia', () => {
  it('tallies a media list into images and videos by kind', () => {
    expect(
      countMedia([
        { kind: 'image' },
        { kind: 'video' },
        { kind: 'image' },
        { kind: 'image' },
      ]),
    ).toEqual({ images: 3, videos: 1 });
  });
});

describe('effectiveMedia', () => {
  const none = { images: 0, videos: 0 };
  const opt = (extra: object) => ({
    key: 'pub.o@1',
    label: 'pub',
    media: none,
    changed: [],
    ...extra,
  });
  it("no overlay, or a medialess overlay, plays the base's set", () => {
    expect(effectiveMedia(null, { images: 9, videos: 1 })).toEqual({
      images: 9,
      videos: 1,
    });
    expect(effectiveMedia(opt({}), { images: 9, videos: 1 })).toEqual({
      images: 9,
      videos: 1,
    });
  });
  it("an overlay that carries media replaces the base's set", () => {
    expect(
      effectiveMedia(opt({ media: { images: 4, videos: 2 } }), {
        images: 9,
        videos: 0,
      }),
    ).toEqual({ images: 4, videos: 2 });
  });
  it("an overlay carrying only videos replaces the base's set", () => {
    expect(
      effectiveMedia(opt({ media: { images: 0, videos: 2 } }), {
        images: 9,
        videos: 0,
      }),
    ).toEqual({ images: 0, videos: 2 });
  });
  it('an overlay with noMedia plays nothing, whatever the base carries', () => {
    expect(
      effectiveMedia(opt({ noMedia: true }), { images: 9, videos: 0 }),
    ).toEqual(none);
  });
});

describe('describeMedia', () => {
  it('counts pictures and videos, singular or plural', () => {
    expect(describeMedia({ images: 1, videos: 0 })).toBe('1 picture');
    expect(describeMedia({ images: 3, videos: 0 })).toBe('3 pictures');
    expect(describeMedia({ images: 0, videos: 1 })).toBe('1 video');
    expect(describeMedia({ images: 0, videos: 2 })).toBe('2 videos');
  });
  it('joins picture and video counts with a middle dot', () => {
    expect(describeMedia({ images: 3, videos: 2 })).toBe(
      '3 pictures · 2 videos',
    );
  });
  it('gives an empty string when a pack carries no media', () => {
    expect(describeMedia({ images: 0, videos: 0 })).toBe('');
  });
});

describe('buildEntries', () => {
  it('with no packs installed, each built-in gets one key-null "default" base option and no overlay options', () => {
    const entries = buildEntries([]);
    expect(entries.map((e) => e.companion.id)).toEqual(BUILT_IN_IDS);
    for (const e of entries) {
      expect(e.builtIn).toBe(true);
      expect(e.bases).toHaveLength(1);
      expect(e.bases[0]).toMatchObject({
        key: null,
        label: 'default',
        changed: [],
      });
      expect(e.overlays).toEqual([]);
    }
  });

  it("lists the built-in entries before an imported pack's, whichever id sorts first", () => {
    const entries = buildEntries([complete('aaa.comp', '1.0.0')]);
    expect(entries.map((e) => e.companion.id)).toEqual([
      ...BUILT_IN_IDS,
      'aaa.comp',
    ]);
  });

  it("a complete pack's versions share one entry, its base options newest first", () => {
    const packs = [
      complete('pub.comp', '1.0.0'),
      complete('pub.comp', '1.10.0'),
    ];
    const entries = buildEntries(packs);
    expect(entries).toHaveLength(BUILT_IN_IDS.length + 1);
    const entry = entries.find((e) => e.companion.id === 'pub.comp')!;
    expect(entry.builtIn).toBe(false);
    expect(entry.bases.map((b) => b.key)).toEqual([
      'pub.comp@1.10.0',
      'pub.comp@1.0.0',
    ]);
    expect(entry.overlays).toEqual([]);
  });

  it("a complete pack's card takes its identity from its newest version", () => {
    const entries = buildEntries([
      complete('pub.comp', '1.0.0', { companion: { description: 'old' } }),
      complete('pub.comp', '1.10.0', { companion: { description: 'new' } }),
    ]);
    const entry = entries.find((e) => e.companion.id === 'pub.comp')!;
    expect(entry.companion.description).toBe('new');
  });

  it('a base option carries the publisher label, version, description, accent colour and media of its own pack', () => {
    const entry = buildEntries([
      complete(
        'pub.comp',
        '2.0.0',
        { companion: { description: 'her own line', accentColour: 'violet' } },
        { media: { images: 5, videos: 1 }, hasPrompt: true },
      ),
    ]).find((e) => e.companion.id === 'pub.comp')!;
    expect(entry.bases).toEqual([
      {
        key: 'pub.comp@2.0.0',
        label: 'pub',
        version: '2.0.0',
        description: 'her own line',
        accent: 'violet',
        media: { images: 5, videos: 1 },
        changed: [],
      },
    ]);
  });

  it("lists an overlay's versions newest first, each with its changed slots in feature-line order", () => {
    const base = BUILT_IN_IDS[0]!;
    const packs = [
      overlay('pub.goth', '1.0.0', base, { companion: { voiceId: 'v1' } }),
      overlay(
        'pub.goth',
        '1.1.0',
        base,
        {
          companion: {
            description: 'gothed up',
            voiceId: 'v2',
            accentColour: 'violet',
            model: 'openrouter/goth-13b',
          },
        },
        { media: { images: 4, videos: 0 }, hasPrompt: true },
      ),
    ];
    const entry = buildEntries(packs).find((e) => e.companion.id === base)!;
    expect(entry.overlays.map((o) => o.key)).toEqual([
      'pub.goth@1.1.0',
      'pub.goth@1.0.0',
    ]);
    expect(entry.overlays[0]).toMatchObject({
      description: 'gothed up',
      accent: 'violet',
      media: { images: 4, videos: 0 },
      changed: ['media', 'prompt', 'voice', 'colour', 'model'],
    });
    expect(entry.overlays[1]!.changed).toEqual(['voice']);
  });

  it('groups overlay options by pack id alphabetically, versions newest first inside a group', () => {
    const base = BUILT_IN_IDS[0]!;
    const entry = buildEntries([
      overlay('zeta.tease', '1.0.0', base),
      overlay('alpha.goth', '1.0.0', base),
      overlay('zeta.tease', '2.0.0', base),
      overlay('alpha.goth', '2.0.0', base),
    ]).find((e) => e.companion.id === base)!;
    expect(entry.overlays.map((o) => o.key)).toEqual([
      'alpha.goth@2.0.0',
      'alpha.goth@1.0.0',
      'zeta.tease@2.0.0',
      'zeta.tease@1.0.0',
    ]);
  });

  it('an overlay carrying only videos counts media among its changed slots', () => {
    const base = BUILT_IN_IDS[0]!;
    const entry = buildEntries([
      overlay(
        'pub.clips',
        '1.0.0',
        base,
        {},
        {
          media: { images: 0, videos: 2 },
          hasPrompt: false,
        },
      ),
    ]).find((e) => e.companion.id === base)!;
    expect(entry.overlays[0]).toMatchObject({
      media: { images: 0, videos: 2 },
      changed: ['media'],
    });
  });

  it('an overlay declaring noMedia is offered as noMedia and counts media among its changed slots', () => {
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
        { media: { images: 7, videos: 0 }, hasPrompt: true },
      ),
      overlay('pub.voice', '1.0.0', 'pub.comp', {
        companion: { voiceId: 'v2' },
      }),
    ];
    const entry = buildEntries(packs).find(
      (e) => e.companion.id === 'pub.comp',
    )!;
    expect(entry.overlays.map((o) => o.key)).toEqual(['pub.voice@1.0.0']);
  });
});
