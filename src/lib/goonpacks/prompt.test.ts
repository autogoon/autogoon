import { describe, expect, it } from '@jest/globals';
import {
  CONTROL_SECTION,
  OUTPUT_FORMAT_SECTION,
  PICTURES_SECTION,
} from '@/lib/companions/shared-prompt';
import { fillSharedSections } from './prompt';

describe('fillSharedSections', () => {
  it('substitutes shared sections by export name', () => {
    const out = fillSharedSections('a\n{{OUTPUT_FORMAT_SECTION}}\nb', {
      includePictures: false,
    });
    expect(out).toBe(`a\n${OUTPUT_FORMAT_SECTION}\nb`);
  });
  it('drops unknown tokens', () => {
    expect(
      fillSharedSections('a{{NOT_A_SECTION}}b', { includePictures: false }),
    ).toBe('ab');
  });
  it('leaves live markers untouched', () => {
    const text = 'x {{TOY_STATUS}} y {{NOW}} z';
    expect(fillSharedSections(text, { includePictures: false })).toBe(text);
  });
  it('fills PICTURES_SECTION only when pictures exist', () => {
    const text = '{{PICTURES_SECTION}}{{CONTROL_SECTION}}';
    expect(fillSharedSections(text, { includePictures: true })).toBe(
      `${PICTURES_SECTION}${CONTROL_SECTION}`,
    );
    expect(fillSharedSections(text, { includePictures: false })).toBe(
      CONTROL_SECTION,
    );
  });
});
