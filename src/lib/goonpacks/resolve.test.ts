import { describe, expect, it } from '@jest/globals';
import { MEDIA_SECTION, TIME_SECTION } from '@/lib/companions/shared-prompt';
import {
  DEFAULT_CHATTINESS,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL,
  DEFAULT_PASSES_REASONING,
  DEFAULT_PLAYFULNESS,
  type Companion,
  type CompanionMedia,
} from '@/lib/companions/companions';
import type { CompanionConfig } from './manifest';
import {
  applyOverlay,
  packToCompanion,
  packToCompanionRaw,
  resolveDefault,
  resolveMediaRef,
} from './resolve';

const base: Companion = {
  id: 'autogoon.aimee',
  name: 'Aimee',
  description: 'sweet',
  gender: 'female',
  accentColour: 'emerald',
  voiceId: 'v-base',
  systemPrompt: 'hi\n{{MEDIA_SECTION}}',
  model: 'm',
  contextWindow: 10,
  passesReasoning: true,
  chattiness: 2,
  playfulness: 4,
};
const overlay = (
  extra: { companion?: CompanionConfig; noMedia?: boolean } = {},
  media = [] as Companion['media'],
) => ({
  manifest: {
    format: 2,
    id: 'g00ner.aimee',
    version: '1.0.0',
    base: 'autogoon.aimee',
    aboutThePack: 'test overlay',
    noMedia: extra.noMedia,
    companion: extra.companion ?? {},
  },
  media: media ?? [],
});
const still = (src: string): CompanionMedia => ({
  kind: 'image',
  description: 'd',
  ref: `goonpack:test.pack@1/${src}`,
  src,
  load: () => Promise.resolve(src),
  forget: () => {},
});

// fillSharedSections appends the time rules to every prompt it assembles; that
// append is prompt.test.ts's to pin, and only noise in these media cases.
const body = (prompt: string): string =>
  prompt.replace(`\n\n${TIME_SECTION}`, '');

describe('applyOverlay', () => {
  it("keeps the base's id, not the overlay pack's own id", () => {
    expect(applyOverlay(base, overlay()).id).toBe('autogoon.aimee');
  });
  it('keeps a base field the overlay does not mention', () => {
    expect(applyOverlay(base, overlay()).voiceId).toBe('v-base');
  });
  it("replaces every field the overlay's companion section sets", () => {
    const out = applyOverlay(
      base,
      overlay({
        companion: {
          description: 'her goth era',
          accentColour: 'violet',
          voiceId: 'v-new',
          model: 'm-new',
          contextWindow: 200_000,
          passesReasoning: false,
          chattiness: 5,
          playfulness: 1,
        },
      }),
    );
    expect(out.description).toBe('her goth era');
    expect(out.accentColour).toBe('violet');
    expect(out.voiceId).toBe('v-new');
    expect(out.model).toBe('m-new');
    expect(out.contextWindow).toBe(200_000);
    expect(out.passesReasoning).toBe(false);
    expect(out.chattiness).toBe(5);
    expect(out.playfulness).toBe(1);
  });
  it("uses the overlay's system prompt in place of the base's", () => {
    const out = applyOverlay(base, { ...overlay(), systemPrompt: 'yo' });
    expect(body(out.systemPrompt)).toBe('yo');
  });
  it("never takes the overlay's name — the base's is kept", () => {
    // The base's name survives only by omission: `name` is absent from the
    // field-by-field merge in applyOverlay and arrives with `...base`. Adding
    // `name: c.name ?? base.name` beside the other eight lines would let an
    // overlay rename a companion and take over their thread.
    const out = applyOverlay(base, overlay({ companion: { name: 'Amy' } }));
    expect(out.name).toBe('Aimee');
  });
  it('fills MEDIA_SECTION when the overlay brings pictures', () => {
    const pics = [still('blob:x')];
    expect(body(applyOverlay(base, overlay({}, pics)).systemPrompt)).toBe(
      `hi\n${MEDIA_SECTION}`,
    );
  });
  it("replaces the base's pictures with the overlay's own media set", () => {
    const pics = [still('blob:overlay')];
    const out = applyOverlay(
      { ...base, media: [still('blob:base')] },
      overlay({}, pics),
    );
    expect(out.media).toEqual(pics);
  });
  it('noMedia leaves the resolved companion with no media', () => {
    const out = applyOverlay(
      { ...base, media: [still('blob:b')] },
      overlay({ noMedia: true }),
    );
    expect(out.media).toBeUndefined();
  });
  it('noMedia drops MEDIA_SECTION from the prompt', () => {
    const out = applyOverlay(
      { ...base, media: [still('blob:b')] },
      overlay({ noMedia: true }),
    );
    expect(body(out.systemPrompt)).toBe('hi\n');
  });
});

describe('packToCompanionRaw + applyOverlay (pack-shaped base)', () => {
  // A non-built-in base must reach applyOverlay with its prompt unfilled, so
  // applyOverlay's fill is the only one — see packToCompanionRaw in resolve.ts.
  const pictureLessBase = () =>
    packToCompanionRaw({
      manifest: {
        format: 2,
        id: 'some.base',
        version: '1',
        aboutThePack: 'a base pack',
        companion: { name: 'Base', voiceId: 'v' },
      },
      systemPrompt: 'hi\n{{MEDIA_SECTION}}',
      media: [],
    });
  it('restores MEDIA_SECTION when the overlay brings pictures over a pictureless base', () => {
    const pics = [still('blob:overlay')];
    const out = applyOverlay(pictureLessBase(), overlay({}, pics));
    expect(body(out.systemPrompt)).toBe(`hi\n${MEDIA_SECTION}`);
  });
  it('leaves MEDIA_SECTION out when neither the pack-shaped base nor the overlay bring pictures', () => {
    const out = applyOverlay(pictureLessBase(), overlay());
    expect(body(out.systemPrompt)).toBe('hi\n');
  });
});

describe('packToCompanion', () => {
  const completePack = (companion: CompanionConfig) => ({
    manifest: {
      format: 2,
      id: 'some.one',
      version: '1',
      aboutThePack: 'a complete pack',
      companion,
    },
    systemPrompt: 'p\n{{MEDIA_SECTION}}',
    media: [still('blob:pack')],
  });
  it('builds a companion with app defaults for omitted fields', () => {
    const c = packToCompanion(completePack({ name: 'One', voiceId: 'v1' }));
    expect(c.id).toBe('some.one');
    expect(c.model).toBe(DEFAULT_MODEL);
    expect(c.contextWindow).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(c.passesReasoning).toBe(DEFAULT_PASSES_REASONING);
    expect(c.chattiness).toBe(DEFAULT_CHATTINESS);
    expect(c.playfulness).toBe(DEFAULT_PLAYFULNESS);
    expect(c.gender).toBe('female');
    expect(c.accentColour).toBe('pink');
  });
  it('fills MEDIA_SECTION for a pack that ships media of its own', () => {
    const c = packToCompanion(completePack({ name: 'One', voiceId: 'v1' }));
    expect(body(c.systemPrompt)).toBe(`p\n${MEDIA_SECTION}`);
  });
  it("falls back to the pack's aboutThePack when the companion section carries no description", () => {
    const c = packToCompanion(completePack({ name: 'One', voiceId: 'v1' }));
    expect(c.description).toBe('a complete pack');
  });
  it('names the companion after the pack id when the manifest gives no name', () => {
    const c = packToCompanion(completePack({ voiceId: 'v1' }));
    expect(c.name).toBe('some.one');
  });
});

describe('resolveDefault', () => {
  it('drops MEDIA_SECTION for a built-in with no pictures', () => {
    expect(body(resolveDefault(base).systemPrompt)).toBe('hi\n');
  });
  it('fills MEDIA_SECTION for a built-in that has pictures of its own', () => {
    const withPics: Companion = { ...base, media: [still('blob:builtin')] };
    expect(body(resolveDefault(withPics).systemPrompt)).toBe(
      `hi\n${MEDIA_SECTION}`,
    );
  });
});

describe('resolveMediaRef', () => {
  const entry = (ref: string, src: string): CompanionMedia => ({
    kind: 'image',
    description: 'd',
    ref,
    src,
    load: () => Promise.resolve(src),
    forget: () => {},
  });
  const media: CompanionMedia[] = [
    entry('goonpack:g00ner.aimee@1.0.0/1', 'blob:first'),
    entry('goonpack:g00ner.aimee@1.0.0/2', 'blob:second'),
  ];
  it('resolves a ref to the item it names, not the first item of its pack', () => {
    expect(resolveMediaRef('goonpack:g00ner.aimee@1.0.0/1', media)).toBe(
      media[0],
    );
    expect(resolveMediaRef('goonpack:g00ner.aimee@1.0.0/2', media)).toBe(
      media[1],
    );
  });
  it('returns null when the same name lives in a different pack', () => {
    expect(resolveMediaRef('goonpack:other.pack@1/1', media)).toBeNull();
  });
  it('never resolves a pre-goonpacks path ref', () => {
    expect(resolveMediaRef('/companions/aimee/x.jpg', media)).toBeNull();
  });
  it('returns null for a companion with no media', () => {
    expect(resolveMediaRef('goonpack:a.b@1/1', undefined)).toBeNull();
  });
});
