import { describe, it, expect } from '@jest/globals';
import {
  COMPANIONS,
  companionClockZone,
  companionList,
  type Companion,
} from './companions';

describe('COMPANIONS registry', () => {
  // Every other test here loops over COMPANIONS and so passes on an empty
  // registry; this is the only one that would catch one.
  it('contains both built-ins', () => {
    expect(Object.keys(COMPANIONS)).toEqual(
      expect.arrayContaining(['autogoon.aimee', 'autogoon.miley']),
    );
  });

  it('gives every companion a non-empty voiceId', () => {
    for (const companion of Object.values(COMPANIONS)) {
      expect(companion.voiceId).not.toBe('');
    }
  });

  it('gives every companion a distinct voiceId', () => {
    const ids = Object.values(COMPANIONS).map((c) => c.voiceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keys each companion by its own id', () => {
    for (const [id, companion] of Object.entries(COMPANIONS)) {
      expect(companion.id).toBe(id);
    }
  });
});

describe('companionList', () => {
  it('holds every companion in the registry', () => {
    expect(companionList.map((c) => c.id).sort()).toEqual(
      Object.keys(COMPANIONS).sort(),
    );
  });

  it('orders companions alphabetically by name, as the picker shows them', () => {
    const names = companionList.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  // The prompt is the front of every request, so anything in it that changes
  // between turns moves the point where a cached prefix stops matching to the
  // very top — costing the whole conversation behind it, not just the prompt.
  // The live values ride a trailing system message instead (liveStateMessage),
  // so what this catches is a persona prompt that grew its own copy of one.
  it("no companion's system prompt contains a per-turn value", () => {
    for (const companion of Object.values(COMPANIONS)) {
      expect(companion.systemPrompt).not.toContain('TOY STATUS (trust this');
      expect(companion.systemPrompt).not.toContain('MY TIME (right now');
      expect(companion.systemPrompt).not.toContain('THEIR TIME (right now');
    }
  });

  it('gives every built-in on real time a zone this runtime can render', () => {
    for (const companion of Object.values(COMPANIONS)) {
      if (!companion.usesRealTime) continue;
      expect(companion.timezone).toBeDefined();
      expect(
        () =>
          new Intl.DateTimeFormat('en-GB', { timeZone: companion.timezone }),
      ).not.toThrow();
    }
  });
});

describe('companionClockZone', () => {
  const withClock = (extra: Partial<Companion>): Companion => ({
    ...COMPANIONS['autogoon.aimee']!,
    ...extra,
  });

  it('is the zone of a companion who uses real time', () => {
    expect(
      companionClockZone(
        withClock({ usesRealTime: true, timezone: 'Asia/Tokyo' }),
      ),
    ).toBe('Asia/Tokyo');
  });

  // A pack may set both — an overlay turning real time off over a base that has
  // a zone leaves exactly this. The zone is then a place they are, not a clock:
  // the persona prompt says what time it is, and a MY TIME line would argue
  // with it.
  it('is undefined for a companion off real time, whatever zone they carry', () => {
    expect(
      companionClockZone(
        withClock({ usesRealTime: false, timezone: 'Asia/Tokyo' }),
      ),
    ).toBeUndefined();
  });

  it('is undefined for a companion on real time with no zone', () => {
    expect(
      companionClockZone(
        withClock({ usesRealTime: true, timezone: undefined }),
      ),
    ).toBeUndefined();
  });
});
