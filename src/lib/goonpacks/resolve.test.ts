import { describe, expect, it } from '@jest/globals';
import { PICTURES_SECTION } from '@/lib/companions/shared-prompt';
import type { Companion, CompanionPicture } from '@/lib/companions/companions';
import {
  applyOverlay,
  packToCompanion,
  packToCompanionRaw,
  resolveDefault,
  resolvePictureRef,
} from './resolve';

const base: Companion = {
  id: 'autogoon.aimee',
  name: 'Aimee',
  description: 'sweet',
  gender: 'female',
  accentColour: 'emerald',
  voiceId: 'v-base',
  systemPrompt: 'hi\n{{PICTURES_SECTION}}',
  model: 'm',
  contextWindow: 10,
  passesReasoning: true,
};
const overlay = (
  extra: { companion?: object; noPictures?: boolean } = {},
  pictures = [] as Companion['pictures'],
) => ({
  manifest: {
    format: 1,
    id: 'g00ner.aimee',
    version: '1.0.0',
    base: 'autogoon.aimee',
    aboutThePack: 'test overlay',
    noPictures: extra.noPictures,
    companion: extra.companion ?? {},
  },
  pictures: pictures ?? [],
});

describe('applyOverlay', () => {
  it('keeps the base id and fields the overlay omits', () => {
    const out = applyOverlay(base, overlay());
    expect(out.id).toBe('autogoon.aimee');
    expect(out.voiceId).toBe('v-base');
  });
  it('replaces fields the overlay provides', () => {
    const out = applyOverlay(base, {
      ...overlay({
        companion: { voiceId: 'v-new', description: 'her goth era' },
      }),
      systemPrompt: 'yo {{NOT_A_SECTION}}',
    });
    expect(out.voiceId).toBe('v-new');
    expect(out.description).toBe('her goth era');
    expect(out.systemPrompt).toBe('yo ');
  });
  it("never takes the overlay's name — the base's is kept", () => {
    // The manifest rejects `name` on overlays; belt and braces, the merge
    // ignores it even if one sneaks into a stored record.
    const out = applyOverlay(base, overlay({ companion: { name: 'Amy' } }));
    expect(out.name).toBe('Aimee');
  });
  it('fills PICTURES_SECTION when the overlay brings pictures', () => {
    const pics = [{ src: 'blob:x', description: 'd' }];
    expect(applyOverlay(base, overlay({}, pics)).systemPrompt).toBe(
      `hi\n${PICTURES_SECTION}`,
    );
    expect(applyOverlay(base, overlay()).systemPrompt).toBe('hi\n');
  });
  it("noPictures strips the base's pictures and the section", () => {
    const basePics: Companion = {
      ...base,
      pictures: [{ src: 'blob:b', description: 'd' }],
    };
    const out = applyOverlay(basePics, overlay({ noPictures: true }));
    expect(out.pictures).toBeUndefined();
    expect(out.systemPrompt).toBe('hi\n');
  });
});

describe('packToCompanionRaw + applyOverlay (pack-shaped base)', () => {
  // A non-built-in base must go through the overlay resolve unfilled
  // (packToCompanionRaw), so applyOverlay's fill is the only one — filling
  // twice would strip {{PICTURES_SECTION}} for good on the first (pictureless)
  // pass, before the overlay's own pictures ever get a say.
  const pictureLessBase = () =>
    packToCompanionRaw({
      manifest: {
        format: 1,
        id: 'some.base',
        version: '1',
        aboutThePack: 'a base pack',
        companion: { name: 'Base', voiceId: 'v' },
      },
      systemPrompt: 'hi\n{{PICTURES_SECTION}}',
      pictures: [],
    });
  it('restores PICTURES_SECTION when the overlay brings pictures over a pictureless base', () => {
    const pics = [{ src: 'blob:overlay', description: 'd' }];
    const out = applyOverlay(pictureLessBase(), overlay({}, pics));
    expect(out.systemPrompt).toBe(`hi\n${PICTURES_SECTION}`);
  });
  it('stays dropped when neither the base nor the overlay bring pictures', () => {
    const out = applyOverlay(pictureLessBase(), overlay());
    expect(out.systemPrompt).toBe('hi\n');
  });
});

describe('packToCompanion', () => {
  it('builds a companion with app defaults for omitted fields', () => {
    const c = packToCompanion({
      manifest: {
        format: 1,
        id: 'some.one',
        version: '1',
        aboutThePack: 'a complete pack',
        companion: { name: 'One', voiceId: 'v1' },
      },
      systemPrompt: 'p',
      pictures: [],
    });
    expect(c.id).toBe('some.one');
    expect(c.model).toBe('minimax/minimax-m3');
    expect(c.contextWindow).toBe(1_000_000);
    expect(c.passesReasoning).toBe(true);
    expect(c.gender).toBe('female');
    expect(c.accentColour).toBe('pink');
  });
});

describe('resolveDefault', () => {
  it("fills the built-in's tokens (pictureless → section dropped)", () => {
    expect(resolveDefault(base).systemPrompt).toBe('hi\n');
  });
});

describe('resolvePictureRef', () => {
  const pictures: CompanionPicture[] = [
    { src: 'blob:live', description: 'd', ref: 'goonpack:g00ner.aimee/1' },
  ];
  it("resolves a matching ref to its picture's src", () => {
    expect(resolvePictureRef('goonpack:g00ner.aimee/1', pictures)).toBe(
      'blob:live',
    );
  });
  it('returns null when the same name lives in a different pack', () => {
    expect(resolvePictureRef('goonpack:other.pack/1', pictures)).toBeNull();
  });
  it('never resolves a pre-goonpacks path ref', () => {
    expect(resolvePictureRef('/companions/aimee/x.jpg', pictures)).toBeNull();
  });
});
