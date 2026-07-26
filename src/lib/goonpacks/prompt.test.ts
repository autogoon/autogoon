import { describe, expect, it } from '@jest/globals';
import {
  CONTROL_SECTION,
  MEDIA_SECTION,
  OUTPUT_FORMAT_SECTION,
} from '@/lib/companions/shared-prompt';
import { fillSharedSections } from './prompt';

describe('fillSharedSections', () => {
  it('substitutes shared sections by export name', () => {
    const out = fillSharedSections('a\n{{OUTPUT_FORMAT_SECTION}}\nb', {
      includeMedia: false,
    });
    expect(out).toBe(`a\n${OUTPUT_FORMAT_SECTION}\nb`);
  });
  it('drops unknown tokens', () => {
    expect(
      fillSharedSections('a{{NOT_A_SECTION}}b', { includeMedia: false }),
    ).toBe('ab');
  });
  it('leaves live markers untouched', () => {
    const text = 'x {{TOY_STATUS}} y {{NOW}} z';
    expect(fillSharedSections(text, { includeMedia: false })).toBe(text);
  });
  it('fills MEDIA_SECTION only when media exists', () => {
    const text = '{{MEDIA_SECTION}}{{CONTROL_SECTION}}';
    expect(fillSharedSections(text, { includeMedia: true })).toBe(
      `${MEDIA_SECTION}${CONTROL_SECTION}`,
    );
    expect(fillSharedSections(text, { includeMedia: false })).toBe(
      CONTROL_SECTION,
    );
  });
});
