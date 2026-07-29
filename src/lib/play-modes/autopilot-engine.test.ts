import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { PlayerContext, SpeedEvent } from '../program';
import type { EdgeControlLevel, IntensityLevel } from './autopilot-engine';
import { AutopilotEngine } from './autopilot-engine';

// Autopilot recreates Autoblow's algorithm, so modes/AUTOPILOT.md is the
// specification and these values are contract rather than tuning. The pulse
// gate and the pulse-length formula are tabulated there under "Vacuum
// maintenance"; the layout, remap and edge-control rules under "Intensity" and
// "Edge control".

const CTX: PlayerContext = { clock: 0, currentRawSpeed: 0 };

const steps = (
  from: number,
  count: number,
  gap: number,
  speed: number,
): SpeedEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    kind: 'speed' as const,
    at: from + i * gap,
    speed,
  }));

const opens = (engine: AutopilotEngine, events: SpeedEvent[], until: number) =>
  engine
    .generateValves(events, events[0]!.at, until, CTX)
    .filter((v) => v.open)
    .map((v) => v.at);

describe('AutopilotEngine.generateValves (vacuum maintenance)', () => {
  it('holds the first pulse back until the minimum gap has elapsed from session start', () => {
    const engine = new AutopilotEngine('medium', 'moderate', 'little');
    // Steps every 5 s from session start; little = 3 s minimum gap. The gate
    // starts closed (the original's lastSuctionTime starts at 0), so the
    // step at 0 does not pulse; every 5 s step after it does.
    expect(opens(engine, steps(0, 12, 5_000, 50), 60_000)).toEqual([
      5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000,
      50_000, 55_000,
    ]);
  });

  it('fires at most one pulse per step, however long the step', () => {
    const engine = new AutopilotEngine('medium', 'moderate', 'more');
    // Steps every 10 s, more = 2 s minimum gap: one pulse per step, NOT five
    // pulses spread across each 10 s step.
    expect(opens(engine, steps(0, 6, 10_000, 50), 60_000)).toEqual([
      10_000, 20_000, 30_000, 40_000, 50_000,
    ]);
  });

  it('skips steps that come sooner than the minimum gap', () => {
    const engine = new AutopilotEngine('medium', 'moderate', 'little');
    // Steps every 1 s, 3 s minimum gap: only every third step pulses.
    expect(opens(engine, steps(0, 10, 1_000, 50), 10_000)).toEqual([
      3_000, 6_000, 9_000,
    ]);
  });

  it('pulses at the next move on a mid-session re-lay', () => {
    const engine = new AutopilotEngine('medium', 'moderate', 'little');
    // A suction-knob change re-lays the overlay from the current clock; the
    // original resets lastSuctionTime on the change, so the next move pulses
    // immediately — even sooner than the interval after the re-lay point.
    const events = steps(50_000, 2, 5_000, 50);
    const valves = engine.generateValves(events, 47_500, 60_000, CTX);
    expect(valves.filter((v) => v.open).map((v) => v.at)).toEqual([
      50_000, 55_000,
    ]);
  });

  it("keys each pulse's length to that move's speed", () => {
    const engine = new AutopilotEngine('medium', 'moderate', 'little');
    // Original formula: round(baseDuration × speedMultiplier / (speed/100 + 0.1)).
    // little at speed 20 → round(200 × 0.8 / 0.3) = 533; at speed 100 →
    // round(200 × 0.8 / 1.1) = 145. Two pulsing moves, so a fixed-length pulse
    // can't satisfy both.
    const events: SpeedEvent[] = [
      { kind: 'speed', at: 0, speed: 50 },
      { kind: 'speed', at: 5_000, speed: 20 },
      { kind: 'speed', at: 10_000, speed: 100 },
    ];
    const valves = engine.generateValves(events, 0, 15_000, CTX);
    expect(valves).toEqual([
      { kind: 'valve', at: 5_000, valve: 'minus', open: true },
      { kind: 'valve', at: 5_533, valve: 'minus', open: false },
      { kind: 'valve', at: 10_000, valve: 'minus', open: true },
      { kind: 'valve', at: 10_145, valve: 'minus', open: false },
    ]);
  });

  it('emits nothing when off', () => {
    const engine = new AutopilotEngine('medium', 'moderate', 'off');
    expect(
      engine.generateValves(steps(0, 12, 5_000, 50), 0, 60_000, CTX),
    ).toEqual([]);
  });

  it('closes both valves when finishing', () => {
    const engine = new AutopilotEngine('medium', 'moderate', 'more');
    engine.beginFinish();
    expect(engine.generateValves([], 1_000, 60_000, CTX)).toEqual([
      { kind: 'valve', at: 1_000, valve: 'minus', open: false },
      { kind: 'valve', at: 1_000, valve: 'plus', open: false },
    ]);
  });
});

// PATTERN_TEMPLATES is not exported, so the draw is pinned through Math.random.
// 0.8 of the eight templates selects "Max plateaus, shrinking rests"
// (modes/AUTOPILOT.md, pattern 7) — the one whose step durations all differ, so
// a step laid out against a neighbour's duration shows up. Adding a template
// shifts the draw, which fails these tests rather than silently exercising a
// different pattern.
const MAX_PLATEAU_DRAW = 0.8;

// The template behind the expectations below, as {speed, duration} pairs:
// 20@5s 40@10s 100@10s 30@9s 100@10s 20@8s …
const speedsFrom = (
  intensity: IntensityLevel,
  edge: EdgeControlLevel,
): SpeedEvent[] => {
  jest.spyOn(Math, 'random').mockReturnValue(MAX_PLATEAU_DRAW);
  return new AutopilotEngine(intensity, edge, 'off').generateSpeed(
    0,
    200_000,
    CTX,
  );
};

const holds = (events: SpeedEvent[], count: number) =>
  Array.from({ length: count }, (_, i) => events[i + 1]!.at - events[i]!.at);

describe('AutopilotEngine.generateSpeed', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('holds each pattern step for its own duration', () => {
    // Not the next step's: the full-speed bursts stay at 10 s while the rests
    // between them shrink, which is what pattern 7 is.
    expect(holds(speedsFrom('high', 'moderate'), 12)).toEqual([
      5_000, 10_000, 10_000, 9_000, 10_000, 8_000, 10_000, 7_000, 10_000, 6_000,
      10_000, 5_000,
    ]);
  });

  it('opens a block with the pattern first step, at the requested time', () => {
    const [first] = speedsFrom('high', 'moderate');
    // Template speed 20 remapped into High's 30–100 range.
    expect(first).toEqual({ kind: 'speed', at: 0, speed: 41 });
  });

  it('remaps each template speed into the intensity range', () => {
    // modes/AUTOPILOT.md: a template step of 100 becomes 20 on Warmup and 70
    // on Medium. The pattern tops out at 100, so its peak is that top value.
    const peak = (intensity: IntensityLevel) =>
      Math.max(...speedsFrom(intensity, 'moderate').map((e) => e.speed));
    expect(peak('warmup')).toBe(20);
    expect(peak('low')).toBe(30);
    expect(peak('medium')).toBe(70);
    expect(peak('high')).toBe(100);
  });

  it('stretches the peaks and cuts the valleys under intense edge control', () => {
    // ×1.5 above 70, ×0.5 below 30, keyed off the template speed; the 40 and
    // the 30 sit between the bands and are left alone.
    expect(holds(speedsFrom('high', 'intense'), 6)).toEqual([
      2_500, 10_000, 15_000, 9_000, 15_000, 4_000,
    ]);
  });

  it('eases off the peaks and stretches the valleys under gentle edge control', () => {
    expect(holds(speedsFrom('high', 'gentle'), 6)).toEqual([
      10_000, 10_000, 5_000, 9_000, 5_000, 16_000,
    ]);
  });
});
