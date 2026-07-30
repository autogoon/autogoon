import { describe, expect, it } from '@jest/globals';
import {
  CONTROL_SECTION,
  OUTPUT_FORMAT_SECTION,
  TIME_SECTION,
  mediaSection,
} from '@/lib/companions/shared-prompt';
import { fillSharedSections } from './prompt';

// Every assembled prompt ends with the time rules, so each expectation
// carries them too.
const TAIL = `\n\n${TIME_SECTION}`;

describe('fillSharedSections', () => {
  it('substitutes shared sections by export name', () => {
    const out = fillSharedSections('a\n{{OUTPUT_FORMAT_SECTION}}\nb', {});
    expect(out).toBe(`a\n${OUTPUT_FORMAT_SECTION}\nb${TAIL}`);
  });
  // Written out rather than dropped, so a pack author sees the typo instead of
  // wondering where their section went.
  it('leaves an unknown token in the prompt as written', () => {
    expect(fillSharedSections('a{{NOT_A_SECTION}}b', {})).toBe(
      `a{{NOT_A_SECTION}}b${TAIL}`,
    );
  });
  it('leaves live markers untouched', () => {
    const text = 'x {{TOY_STATUS}} y {{NOW}} z';
    expect(fillSharedSections(text, {})).toBe(`${text}${TAIL}`);
  });

  it('puts the set summary into the media section', () => {
    const text = '{{MEDIA_SECTION}}{{CONTROL_SECTION}}';
    expect(
      fillSharedSections(text, {
        mediaSummary: 'Mostly beach shots, a few indoors.',
      }),
    ).toBe(
      `${mediaSection('Mostly beach shots, a few indoors.')}${CONTROL_SECTION}${TAIL}`,
    );
  });

  it('tells a companion with no summary they have nothing to send', () => {
    const text = '{{MEDIA_SECTION}}{{CONTROL_SECTION}}';
    expect(fillSharedSections(text, {})).toBe(
      `${mediaSection(undefined)}${CONTROL_SECTION}${TAIL}`,
    );
  });

  it('names both media tools, since one is useless without the other', () => {
    const filled = fillSharedSections('{{MEDIA_SECTION}}', {
      mediaSummary: 'A set.',
    });
    expect(filled).toContain('search_media');
    expect(filled).toContain('send_media');
  });

  it('offers no tool to a companion with nothing to send, so neither is named', () => {
    const filled = fillSharedSections('{{MEDIA_SECTION}}', {});
    expect(filled).not.toContain('search_media');
    expect(filled).not.toContain('send_media');
  });

  // The reason it is appended rather than offered as a {{token}}: a pack that
  // never places one, or one with no device that drops CONTROL_SECTION, is
  // still sent a TIME line and still has to know how to read it.
  it('appends the time rules to a prompt that places no tokens at all', () => {
    expect(fillSharedSections('just the persona', {})).toBe(
      `just the persona${TAIL}`,
    );
  });

  it('appends the time rules even when the toy section is left out', () => {
    const out = fillSharedSections('{{OUTPUT_FORMAT_SECTION}}', {});
    expect(out).not.toContain(CONTROL_SECTION);
    expect(out).toContain(TIME_SECTION);
  });
});
