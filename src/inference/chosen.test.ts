// What the screen settles on when the URL names one thing, the other or
// neither. Storage isn't covered: the accessors hold no decision, and `choose`
// takes what they read as an argument.

import { describe, expect, it } from '@jest/globals';
import { choose } from './chosen';

const PACKS = ['aimee', 'elise'];
const EXPERIMENTS = ['2026-08-02-baseline', '2026-08-03-terse'];
const NOTHING = { pack: '', experiment: '' };

describe('choose', () => {
  it('takes what the URL names over what was last selected', () => {
    expect(
      choose(
        { pack: 'aimee', experiment: EXPERIMENTS[1]! },
        PACKS,
        EXPERIMENTS,
        { pack: 'elise', experiment: EXPERIMENTS[0]! },
      ),
    ).toEqual({ pack: 'aimee', experiment: EXPERIMENTS[1]! });
  });

  it('takes a pack the URL names that the listing does not offer, for the routes to refuse', () => {
    expect(
      choose({ pack: 'gone', experiment: '' }, PACKS, [], NOTHING).pack,
    ).toBe('gone');
  });

  it('falls back to what was last selected where the URL names neither', () => {
    const last = { pack: 'elise', experiment: EXPERIMENTS[1]! };
    expect(choose(NOTHING, PACKS, EXPERIMENTS, last)).toEqual(last);
  });

  it('falls back to the first on offer where what was last selected is gone', () => {
    expect(
      choose(NOTHING, PACKS, EXPERIMENTS, {
        pack: 'deleted',
        experiment: 'removed',
      }),
    ).toEqual({ pack: 'aimee', experiment: EXPERIMENTS[0]! });
  });

  it('answers empty for a kind with nothing on offer at all', () => {
    expect(choose(NOTHING, [], [], NOTHING)).toEqual(NOTHING);
  });

  it('settles the pack and the experiment independently', () => {
    expect(
      choose({ pack: 'elise', experiment: '' }, PACKS, EXPERIMENTS, {
        pack: 'aimee',
        experiment: EXPERIMENTS[1]!,
      }),
    ).toEqual({ pack: 'elise', experiment: EXPERIMENTS[1]! });
  });
});
