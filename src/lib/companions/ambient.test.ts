import { describe, it, expect } from '@jest/globals';
import { ambientDelayMs } from './ambient';
import type { Companion } from './companions';

const companion = (chattiness: number, playfulness: number): Companion => ({
  id: 'autogoon.test',
  name: 'Test',
  description: '',
  gender: 'female',
  accentColour: 'pink',
  voiceId: 'v',
  systemPrompt: '',
  model: 'm',
  contextWindow: 1,
  passesReasoning: false,
  chattiness,
  playfulness,
});

// rand 0 and 1 are the ends of the jitter, so they pin the range exactly;
// nothing here relies on a sample landing somewhere useful.
const MIN = 0;
const MAX = 1;

describe('ambientDelayMs', () => {
  it('runs from a long pause at 1 to a short one at 5, out of play', () => {
    // 60s − 10s×trait, then −50%/+20%.
    expect(ambientDelayMs(companion(1, 3), false, MIN)).toBe(25_000);
    expect(ambientDelayMs(companion(1, 3), false, MAX)).toBe(60_000);
    expect(ambientDelayMs(companion(5, 3), false, MIN)).toBe(5_000);
    expect(ambientDelayMs(companion(5, 3), false, MAX)).toBe(12_000);
  });

  it('runs shorter in play, where the same gap feels longer', () => {
    // 30s − 5s×trait, same jitter.
    expect(ambientDelayMs(companion(3, 1), true, MIN)).toBe(12_500);
    expect(ambientDelayMs(companion(3, 1), true, MAX)).toBe(30_000);
    expect(ambientDelayMs(companion(3, 5), true, MIN)).toBe(2_500);
    expect(ambientDelayMs(companion(3, 5), true, MAX)).toBe(6_000);
  });

  // The two appetites are independent by design: this companion barely speaks
  // between turns but narrates play relentlessly, and one knob couldn't say so.
  it('reads the appetite the situation calls for, not the other one', () => {
    const laconicButLoudInPlay = companion(1, 5);
    expect(ambientDelayMs(laconicButLoudInPlay, false, MIN)).toBe(25_000);
    expect(ambientDelayMs(laconicButLoudInPlay, true, MIN)).toBe(2_500);
  });

  it('is monotonic — more appetite is never a longer wait', () => {
    for (const playing of [false, true]) {
      const delays = [1, 2, 3, 4, 5].map((t) =>
        ambientDelayMs(companion(t, t), playing, 0.5),
      );
      expect(delays).toEqual([...delays].sort((a, b) => b - a));
    }
  });

  // The jitter is deliberately lopsided, so the base delay is NOT the typical
  // one — a mid sample lands 15% under it. Pinned so a later "tidy-up" to a
  // symmetric range has to be a deliberate choice.
  it('biases early: a mid sample is 0.85x the base', () => {
    expect(ambientDelayMs(companion(3, 3), false, 0.5)).toBe(25_500);
    expect(ambientDelayMs(companion(3, 3), true, 0.5)).toBe(12_750);
  });

  it('clamps a trait outside the scale', () => {
    expect(ambientDelayMs(companion(0, 3), false, MIN)).toBe(
      ambientDelayMs(companion(1, 3), false, MIN),
    );
    // Unclamped, the in-play curve hits zero at 6 and goes negative past it.
    expect(ambientDelayMs(companion(3, 99), true, MIN)).toBe(
      ambientDelayMs(companion(3, 5), true, MIN),
    );
  });
});
