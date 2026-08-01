import { describe, expect, it } from '@jest/globals';
import {
  CONTROL_SECTION,
  OUTPUT_FORMAT_SECTION,
  USER_CLOCK_SECTION,
  CONVERSATION_SECTION,
  mediaSection,
} from '@/lib/companions/shared-prompt';
import { fillSharedSections } from './prompt';

// Every assembled prompt ends with the clock rules that apply to it, so each
// expectation carries them too.
const TAIL = `\n\n${USER_CLOCK_SECTION}\n\n${CONVERSATION_SECTION}`;

describe('fillSharedSections', () => {
  it('substitutes shared sections by export name', () => {
    const out = fillSharedSections('a\n{{OUTPUT_FORMAT_SECTION}}\nb', {
      knowsUserTime: true,
    });
    expect(out).toBe(`a\n${OUTPUT_FORMAT_SECTION}\nb${TAIL}`);
  });
  // Written out rather than dropped, so a pack author sees the typo instead of
  // wondering where their section went.
  it('leaves an unknown token in the prompt as written', () => {
    expect(
      fillSharedSections('a{{NOT_A_SECTION}}b', { knowsUserTime: true }),
    ).toBe(`a{{NOT_A_SECTION}}b${TAIL}`);
  });

  it('puts the set summary into the media section', () => {
    const text = '{{MEDIA_SECTION}}{{CONTROL_SECTION}}';
    expect(
      fillSharedSections(text, {
        mediaSummary: 'Mostly beach shots, a few indoors.',
        knowsUserTime: true,
      }),
    ).toBe(
      `${mediaSection('Mostly beach shots, a few indoors.')}${CONTROL_SECTION}${TAIL}`,
    );
  });

  it('tells a companion with no summary they have nothing to send', () => {
    const text = '{{MEDIA_SECTION}}{{CONTROL_SECTION}}';
    expect(fillSharedSections(text, { knowsUserTime: true })).toBe(
      `${mediaSection(undefined)}${CONTROL_SECTION}${TAIL}`,
    );
  });

  it('names both media tools, since one is useless without the other', () => {
    const filled = fillSharedSections('{{MEDIA_SECTION}}', {
      mediaSummary: 'A set.',
      knowsUserTime: true,
    });
    expect(filled).toContain('search_media');
    expect(filled).toContain('send_media');
  });

  it('offers no tool to a companion with nothing to send, so neither is named', () => {
    const filled = fillSharedSections('{{MEDIA_SECTION}}', {
      knowsUserTime: true,
    });
    expect(filled).not.toContain('search_media');
    expect(filled).not.toContain('send_media');
  });

  // The reason these are appended rather than offered as {{tokens}}: what a
  // companion is sent is decided by their own clock settings, so a pack that
  // places no token — or one with no device that drops CONTROL_SECTION — still
  // gets the rules for the lines they do get.
  it('appends the conversation rules to a prompt that places no tokens at all', () => {
    expect(
      fillSharedSections('just the persona', { knowsUserTime: true }),
    ).toBe(`just the persona${TAIL}`);
  });

  it("appends the user's clock rules even when the toy section is left out", () => {
    const out = fillSharedSections('{{OUTPUT_FORMAT_SECTION}}', {
      knowsUserTime: true,
    });
    expect(out).not.toContain(CONTROL_SECTION);
    expect(out).toContain(USER_CLOCK_SECTION);
  });

  it("appends the companion's clock rules when the companion has a zone", () => {
    expect(
      fillSharedSections('PERSONA', {
        companionTimeZone: 'Asia/Tokyo',
        knowsUserTime: true,
      }),
    ).toContain('MY TIME');
  });

  it("leaves the companion's clock rules out when the companion has no zone", () => {
    expect(
      fillSharedSections('PERSONA', { knowsUserTime: true }),
    ).not.toContain('MY TIME');
  });

  it("leaves the user's clock rules out when the user's time is withheld", () => {
    expect(
      fillSharedSections('PERSONA', {
        companionTimeZone: 'Asia/Tokyo',
        knowsUserTime: false,
      }),
    ).not.toContain('THEIR TIME');
  });

  it('appends the conversation-gap rules whatever the clocks are', () => {
    expect(fillSharedSections('PERSONA', { knowsUserTime: false })).toContain(
      '3 hours pass',
    );
  });
});
