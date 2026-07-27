import { describe, expect, it } from '@jest/globals';
import {
  CONTROL_SECTION,
  MEDIA_SECTION,
  OUTPUT_FORMAT_SECTION,
  TIME_SECTION,
} from '@/lib/companions/shared-prompt';
import { fillSharedSections } from './prompt';

// Every assembled prompt ends with the time rules, so each expectation below
// carries them too.
const TAIL = `\n\n${TIME_SECTION}`;

describe('fillSharedSections', () => {
  it('substitutes shared sections by export name', () => {
    const out = fillSharedSections('a\n{{OUTPUT_FORMAT_SECTION}}\nb', {
      includeMedia: false,
    });
    expect(out).toBe(`a\n${OUTPUT_FORMAT_SECTION}\nb${TAIL}`);
  });
  // Written out rather than dropped, so a pack author sees the typo instead of
  // wondering where their section went.
  it('leaves an unknown token in the prompt as written', () => {
    expect(
      fillSharedSections('a{{NOT_A_SECTION}}b', { includeMedia: false }),
    ).toBe(`a{{NOT_A_SECTION}}b${TAIL}`);
  });
  it('leaves live markers untouched', () => {
    const text = 'x {{TOY_STATUS}} y {{NOW}} z';
    expect(fillSharedSections(text, { includeMedia: false })).toBe(
      `${text}${TAIL}`,
    );
  });
  it('fills MEDIA_SECTION only when media exists', () => {
    const text = '{{MEDIA_SECTION}}{{CONTROL_SECTION}}';
    expect(fillSharedSections(text, { includeMedia: true })).toBe(
      `${MEDIA_SECTION}${CONTROL_SECTION}${TAIL}`,
    );
    expect(fillSharedSections(text, { includeMedia: false })).toBe(
      `${CONTROL_SECTION}${TAIL}`,
    );
  });

  // The reason it is appended rather than offered as a {{token}}: a pack that
  // never places one, or one with no device that drops CONTROL_SECTION, is
  // still sent a TIME line and still has to know how to read it.
  it('appends the time rules to a prompt that places no tokens at all', () => {
    expect(
      fillSharedSections('just the persona', { includeMedia: false }),
    ).toBe(`just the persona${TAIL}`);
  });

  it('appends the time rules even when the toy section is left out', () => {
    const out = fillSharedSections('{{OUTPUT_FORMAT_SECTION}}', {
      includeMedia: false,
    });
    expect(out).not.toContain(CONTROL_SECTION);
    expect(out).toContain(TIME_SECTION);
  });
});
