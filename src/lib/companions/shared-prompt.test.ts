import { describe, it, expect } from '@jest/globals';
import {
  CONTROL_SECTION,
  TIME_SECTION,
  liveStateMessage,
} from './shared-prompt';

// Which section explains which of the two lines. TIME is deliberately not
// CONTROL_SECTION's: a companion with no device is sent one and CONTROL_SECTION
// is not.
const OWNER: Record<string, string> = {
  TIME: TIME_SECTION,
  'TOY STATUS': CONTROL_SECTION,
};

describe('liveStateMessage', () => {
  // The sections talk the companion through "the TIME line" and "the TOY STATUS
  // line" in prose, and this is what emits them. Rename a label on either side
  // alone and the prompt tells the companion to trust a line that isn't there.
  it('labels each line with a name its own section tells the companion to look for', () => {
    const labels = liveStateMessage('<now>', '<status>')
      .split('\n')
      .map((line) => line.split(/[(:]/)[0]!.trim());
    expect(labels).toEqual(['TIME', 'TOY STATUS']);
    for (const label of labels) {
      expect(OWNER[label]).toContain(`${label} line`);
    }
  });
});
