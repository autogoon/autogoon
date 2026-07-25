import { describe, expect, it } from '@jest/globals';
import type { PlayerContext, SpeedEvent } from '../program';
import { AutopilotEngine } from './autopilot-engine';

// Vacuum maintenance, faithful to the original bundle's handleSuctionControl:
// a pulse fires only when a speed move is sent (a step transition — never
// mid-step), gated by "at least `interval` since the last pulse". The
// interval is a minimum gap, not a cadence.

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
  it('pulses only at speed moves, first once the interval has elapsed', () => {
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
    // little at speed 20 → round(200 × 0.8 / 0.3) = 533.
    const events: SpeedEvent[] = [
      { kind: 'speed', at: 0, speed: 50 },
      { kind: 'speed', at: 5_000, speed: 20 },
    ];
    const valves = engine.generateValves(events, 0, 10_000, CTX);
    expect(valves).toEqual([
      { kind: 'valve', at: 5_000, valve: 'minus', open: true },
      { kind: 'valve', at: 5_533, valve: 'minus', open: false },
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
