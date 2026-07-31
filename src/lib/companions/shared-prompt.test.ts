import { describe, it, expect } from '@jest/globals';
import {
  COMPANION_CLOCK_SECTION,
  CONTROL_SECTION,
  USER_CLOCK_SECTION,
  liveStateMessage,
} from './shared-prompt';

// Which section explains which line. Neither clock is CONTROL_SECTION's: a
// companion with no device is sent a clock and CONTROL_SECTION is not.
const OWNER: Record<string, string> = {
  'MY TIME': COMPANION_CLOCK_SECTION,
  'THEIR TIME': USER_CLOCK_SECTION,
  'TOY STATUS': CONTROL_SECTION,
};

describe('liveStateMessage', () => {
  // The sections talk the companion through each line in prose, and this is
  // what emits them. Rename a label on either side alone and the prompt tells
  // the companion to trust a line that isn't there.
  it('labels each line with a name its own section tells the companion to look for', () => {
    const labels = liveStateMessage({
      userNow: '<now>',
      companionNow: '<their now>',
      toyStatus: '<status>',
    })
      .split('\n')
      .map((line) => line.split(/[(:]/)[0]!.trim());
    expect(labels).toEqual(['MY TIME', 'THEIR TIME', 'TOY STATUS']);
    for (const label of labels) {
      expect(OWNER[label]).toContain(label);
    }
  });

  it('emits the user line alone when the companion has no clock', () => {
    expect(
      liveStateMessage({
        userNow: 'Thursday 23 July 2026, 2:05 pm',
        toyStatus: 'idle',
      }),
    ).toBe(
      'THEIR TIME (right now): Thursday 23 July 2026, 2:05 pm\n' +
        'TOY STATUS (trust this over everything else): idle',
    );
  });

  it('puts the companion line above the user line when both are given', () => {
    expect(
      liveStateMessage({
        userNow: 'Thursday 23 July 2026, 2:05 pm',
        companionNow: 'Thursday 23 July 2026, 6:05 am',
        toyStatus: 'idle',
      }),
    ).toBe(
      'MY TIME (right now): Thursday 23 July 2026, 6:05 am\n' +
        'THEIR TIME (right now): Thursday 23 July 2026, 2:05 pm\n' +
        'TOY STATUS (trust this over everything else): idle',
    );
  });

  it('emits the companion line alone when the user clock is withheld', () => {
    expect(
      liveStateMessage({
        companionNow: 'Thursday 23 July 2026, 6:05 am',
        toyStatus: 'idle',
      }),
    ).toBe(
      'MY TIME (right now): Thursday 23 July 2026, 6:05 am\n' +
        'TOY STATUS (trust this over everything else): idle',
    );
  });

  it('emits TOY STATUS alone when neither clock is given', () => {
    expect(liveStateMessage({ toyStatus: 'idle' })).toBe(
      'TOY STATUS (trust this over everything else): idle',
    );
  });
});
