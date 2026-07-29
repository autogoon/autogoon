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
  it('maps the ends of the chattiness scale to their delay range out of play', () => {
    expect(ambientDelayMs(companion(1, 3), false, MIN)).toBe(25_000);
    expect(ambientDelayMs(companion(1, 3), false, MAX)).toBe(60_000);
    expect(ambientDelayMs(companion(5, 3), false, MIN)).toBe(5_000);
    expect(ambientDelayMs(companion(5, 3), false, MAX)).toBe(12_000);
  });

  it('maps the ends of the playfulness scale to their delay range in play', () => {
    expect(ambientDelayMs(companion(3, 1), true, MIN)).toBe(12_500);
    expect(ambientDelayMs(companion(3, 1), true, MAX)).toBe(30_000);
    expect(ambientDelayMs(companion(3, 5), true, MIN)).toBe(2_500);
    expect(ambientDelayMs(companion(3, 5), true, MAX)).toBe(6_000);
  });

  it('uses playfulness in play and chattiness out of play', () => {
    const chatty1Playful5 = companion(1, 5);
    expect(ambientDelayMs(chatty1Playful5, false, MIN)).toBe(25_000);
    expect(ambientDelayMs(chatty1Playful5, true, MIN)).toBe(2_500);
  });

  it('is monotonic — a higher chattiness or playfulness is never a longer wait', () => {
    for (const playing of [false, true]) {
      const delays = [1, 2, 3, 4, 5].map((t) =>
        ambientDelayMs(companion(t, t), playing, 0.5),
      );
      expect(delays).toEqual([...delays].sort((a, b) => b - a));
    }
  });

  // The jitter is deliberately lopsided, so the base delay is NOT the typical
  // one — a mid sample lands 15% under it. There is no way to say that in
  // outputs alone: the delay is linear in `rand`, so a mid sample is the middle
  // of the range whatever the jitter does, and only the base it is measured
  // against tells the two apart. Hence the figures. Pinned so a later "tidy-up"
  // to a symmetric range has to be a deliberate choice.
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
