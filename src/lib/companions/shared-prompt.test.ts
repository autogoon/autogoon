import { describe, it, expect } from '@jest/globals';
import { CONTROL_SECTION, liveStateMessage } from './shared-prompt';

describe('liveStateMessage', () => {
  // CONTROL_SECTION talks the companion through "the TOY STATUS line" and "the
  // TIME line" in prose, and this is what emits them. Rename a label on either
  // side alone and the prompt tells the companion to trust a line that isn't
  // there.
  it('labels each line with a name CONTROL_SECTION tells the companion to look for', () => {
    const labels = liveStateMessage('<now>', '<status>')
      .split('\n')
      .map((line) => line.split(/[(:]/)[0]!.trim());
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(CONTROL_SECTION).toContain(`${label} line`);
    }
  });
});
