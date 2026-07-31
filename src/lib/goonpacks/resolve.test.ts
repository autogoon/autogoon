import { describe, expect, it } from '@jest/globals';
import {
  USER_CLOCK_SECTION,
  CONVERSATION_GAPS_SECTION,
  mediaSection,
} from '@/lib/companions/shared-prompt';
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
  usesRealTime: true,
  knowsUserTime: true,
};
const overlay = (
  extra: {
    companion?: CompanionConfig;
    noMedia?: boolean;
    mediaSummary?: string;
  } = {},
  media = [] as Companion['media'],
) => ({
  manifest: {
    format: 1,
    id: 'g00ner.aimee',
    version: '1.0.0',
    base: 'autogoon.aimee',
    aboutThePack: 'test overlay',
    mediaSummary: extra.mediaSummary,
    noMedia: extra.noMedia,
    companion: extra.companion ?? {},
  },
  media: media ?? [],
});
const still = (src: string): CompanionMedia => ({
  kind: 'image',
  caption: 'd',
  description: 'a longer d',
  ref: `goonpack:test.pack@1/${src}`,
  src,
  load: () => Promise.resolve(src),
  forget: () => {},
});

// fillSharedSections appends the clock rules to every prompt it assembles;
// that append is prompt.test.ts's to pin, and only noise in these media cases.
const body = (prompt: string): string =>
  prompt.replace(
    `\n\n${USER_CLOCK_SECTION}\n\n${CONVERSATION_GAPS_SECTION}`,
    '',
  );

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
    // `name: c.name ?? base.name` beside the other merged fields would let an
    // overlay rename a companion and take over their thread.
    const out = applyOverlay(base, overlay({ companion: { name: 'Amy' } }));
    expect(out.name).toBe('Aimee');
  });
  it('writes the media section from the summary of the set the overlay brought', () => {
    const pics = [still('blob:x')];
    const out = applyOverlay(
      base,
      overlay({ mediaSummary: 'Overlay set.' }, pics),
    );
    expect(body(out.systemPrompt)).toBe(`hi\n${mediaSection('Overlay set.')}`);
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
  it('noMedia turns the media section into the one saying there is nothing to send', () => {
    const out = applyOverlay(
      { ...base, media: [still('blob:b')], mediaSummary: 'Base set.' },
      overlay({ noMedia: true }),
    );
    expect(body(out.systemPrompt)).toBe(`hi\n${mediaSection(undefined)}`);
  });
  it('takes the summary from whichever pack supplied the media', () => {
    const out = applyOverlay(
      { ...base, media: [still('blob:base')], mediaSummary: 'Base set.' },
      overlay({ mediaSummary: 'Overlay set.' }, [still('blob:overlay')]),
    );
    expect(out.mediaSummary).toBe('Overlay set.');
  });
  it('keeps the base summary when an overlay supplies no media', () => {
    const out = applyOverlay(
      { ...base, media: [still('blob:base')], mediaSummary: 'Base set.' },
      overlay({ mediaSummary: 'Overlay set.' }),
    );
    expect(out.mediaSummary).toBe('Base set.');
  });
  it('drops the summary with the media when an overlay sets noMedia', () => {
    const out = applyOverlay(
      { ...base, media: [still('blob:base')], mediaSummary: 'Base set.' },
      overlay({ noMedia: true }),
    );
    expect(out.mediaSummary).toBeUndefined();
  });
  it("takes the overlay's timezone over the base's", () => {
    const out = applyOverlay(
      { ...base, timezone: 'Europe/Paris' },
      overlay({ companion: { timezone: 'Asia/Tokyo' } }),
    );
    expect(out.timezone).toBe('Asia/Tokyo');
  });
  it("keeps the base's timezone when the overlay sets none", () => {
    const out = applyOverlay({ ...base, timezone: 'Europe/Paris' }, overlay());
    expect(out.timezone).toBe('Europe/Paris');
  });
  it("takes the overlay's knowsUserTime over the base's", () => {
    const out = applyOverlay(
      { ...base, knowsUserTime: true },
      overlay({ companion: { knowsUserTime: false } }),
    );
    expect(out.knowsUserTime).toBe(false);
  });
});

describe('packToCompanionRaw + applyOverlay (pack-shaped base)', () => {
  // A non-built-in base must reach applyOverlay with its prompt unfilled, so
  // applyOverlay's fill is the only one — see packToCompanionRaw in resolve.ts.
  const pictureLessBase = () =>
    packToCompanionRaw({
      manifest: {
        format: 1,
        id: 'some.base',
        version: '1',
        aboutThePack: 'a base pack',
        companion: { name: 'Base', voiceId: 'v' },
      },
      systemPrompt: 'hi\n{{MEDIA_SECTION}}',
      media: [],
    });
  it('restores the media section when the overlay brings pictures over a pictureless base', () => {
    const pics = [still('blob:overlay')];
    const out = applyOverlay(
      pictureLessBase(),
      overlay({ mediaSummary: 'Overlay set.' }, pics),
    );
    expect(body(out.systemPrompt)).toBe(`hi\n${mediaSection('Overlay set.')}`);
  });
  it('says there is nothing to send when neither the pack-shaped base nor the overlay bring pictures', () => {
    const out = applyOverlay(pictureLessBase(), overlay());
    expect(body(out.systemPrompt)).toBe(`hi\n${mediaSection(undefined)}`);
  });
  it('defaults both clock flags to true when a pack sets neither', () => {
    const c = pictureLessBase();
    expect(c.usesRealTime).toBe(true);
    expect(c.knowsUserTime).toBe(true);
  });
});

describe('packToCompanion', () => {
  const completePack = (companion: CompanionConfig) => ({
    manifest: {
      format: 1,
      id: 'some.one',
      version: '1',
      aboutThePack: 'a complete pack',
      mediaSummary: 'Pack set.',
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
  it('writes the media section from the summary of a pack that ships media of its own', () => {
    const c = packToCompanion(completePack({ name: 'One', voiceId: 'v1' }));
    expect(body(c.systemPrompt)).toBe(`p\n${mediaSection('Pack set.')}`);
  });
  it("carries the companion's own description to the card", () => {
    const c = packToCompanion(
      completePack({ name: 'One', description: 'quiet', voiceId: 'v1' }),
    );
    expect(c.description).toBe('quiet');
  });
  it('names the companion after the pack id when the manifest gives no name', () => {
    const c = packToCompanion(completePack({ voiceId: 'v1' }));
    expect(c.name).toBe('some.one');
  });
});

describe('resolveDefault', () => {
  it('tells a built-in with no pictures that it has nothing to send', () => {
    expect(body(resolveDefault(base).systemPrompt)).toBe(
      `hi\n${mediaSection(undefined)}`,
    );
  });
  it('writes the media section from the summary of a built-in that has pictures of its own', () => {
    const withPics: Companion = {
      ...base,
      media: [still('blob:builtin')],
      mediaSummary: 'Built-in set.',
    };
    expect(body(resolveDefault(withPics).systemPrompt)).toBe(
      `hi\n${mediaSection('Built-in set.')}`,
    );
  });
});

describe('resolveMediaRef', () => {
  const entry = (ref: string, src: string): CompanionMedia => ({
    kind: 'image',
    caption: 'd',
    description: 'a longer d',
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
