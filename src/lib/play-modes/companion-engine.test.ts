import { describe, expect, it } from '@jest/globals';
import type { PlayerContext, SpeedEvent } from '../program';
import { CompanionEngine } from './companion-engine';

// generateSpeed's dip pattern is random by design, so its tests pin the
// guarantees the Player relies on (see program.ts) rather than exact events.
// The valve overlay, the cumming wind-down and scale are deterministic, and are
// asserted event for event.

const CTX: PlayerContext = { clock: 0, currentRawSpeed: 0 };

describe('CompanionEngine.generateSpeed', () => {
  it("each batch ends after fromTime, so the Player's look-ahead makes progress", () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    let from = 0;
    for (let i = 0; i < 10; i++) {
      const events = engine.generateSpeed(from, from + 60_000, CTX);
      expect(events.length).toBeGreaterThan(0);
      const lastAt = events[events.length - 1]!.at;
      expect(lastAt).toBeGreaterThan(from);
      from = lastAt;
    }
  });

  it('returns events sorted non-decreasing by at', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    let from = 0;
    for (let i = 0; i < 10; i++) {
      const ats = engine
        .generateSpeed(from, from + 60_000, CTX)
        .map((e) => e.at);
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
      from = ats[ats.length - 1]!;
    }
  });

  it('emits every cumming wind-down event unscaled, so the speed percent cannot shrink it', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.beginCumming();
    const ramp = engine.generateSpeed(0, 60_000, CTX);
    expect(ramp.length).toBeGreaterThan(0);
    expect(ramp.every((e) => e.unscaled === true)).toBe(true);
  });

  it('ramps the cumming wind-down from speed 30 down to 5, then parks at 0 half an hour out', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.beginCumming();
    const ramp = engine.generateSpeed(0, 60_000, CTX);
    expect(ramp[0]).toEqual({
      kind: 'speed',
      at: 0,
      speed: 30,
      unscaled: true,
    });
    const ramped = ramp.slice(0, -1);
    expect(
      ramped.every((e, i) => i === 0 || e.speed < ramped[i - 1]!.speed),
    ).toBe(true);
    expect(ramped[ramped.length - 1]).toEqual({
      kind: 'speed',
      at: 11_000,
      speed: 5,
      unscaled: true,
    });
    expect(ramp[ramp.length - 1]).toEqual({
      kind: 'speed',
      at: 1_811_500,
      speed: 0,
      unscaled: true,
    });
  });

  it('emits the cumming wind-down only once, so the next batch is empty', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.beginCumming();
    engine.generateSpeed(0, 60_000, CTX);
    expect(engine.generateSpeed(60_000, 120_000, CTX)).toEqual([]);
  });

  it('generates an ordinary dip batch after reset(), not another cumming wind-down', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.beginCumming();
    engine.generateSpeed(0, 60_000, CTX);
    engine.reset();
    const events = engine.generateSpeed(0, 60_000, CTX);
    // The dip pattern starts at the peak and is scalable; a reset that left
    // `cumming` set would hand back the unscaled wind-down from speed 30 again,
    // stranding the session in the send-off forever.
    expect(events[0]!.speed).toBe(100);
    expect(events.every((e) => e.unscaled === undefined)).toBe(true);
  });

  it('holds at the peak with no dip when variety is off', () => {
    // off = no dip: the floor is pinned to the peak, so every raw speed sits at
    // the peak (pre-scale). Variety off drives both shape knobs to off.
    const engine = new CompanionEngine(50, 'off', 'off');
    const events = engine.generateSpeed(0, 60_000, CTX);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.speed === 100)).toBe(true);
  });

  it('dips to within 5 of a standstill at high', () => {
    // Measured over 300 ten-minute batches: the deepest floor came out 0 or 1
    // at high, and never below 33 at medium — so 5 both holds and tells the
    // levels apart. Asserting an exact 0 misses about 1 run in 100.
    const engine = new CompanionEngine(100, 'high', 'high');
    const events = engine.generateSpeed(0, 600_000, CTX);
    expect(Math.min(...events.map((e) => e.speed))).toBeLessThanOrEqual(5);
  });

  it("resumes from the device's current speed after a knob change", () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.setVariability('high');
    const ctx: PlayerContext = { clock: 0, currentRawSpeed: 37 };
    const events = engine.generateSpeed(0, 60_000, ctx);
    expect(events[0]!.speed).toBe(37);
  });
});

describe('CompanionEngine.generateValves', () => {
  it('emits only the start stroke-minus tease on the window covering start', () => {
    const engine = new CompanionEngine(20, 'low', 'low');
    expect(engine.generateValves([], 0, 60_000, CTX)).toEqual([
      { kind: 'valve', at: 0, valve: 'minus', open: true },
      { kind: 'valve', at: 10_000, valve: 'minus', open: false },
    ]);
  });

  it('emits nothing on a mid-session window', () => {
    const engine = new CompanionEngine(20, 'low', 'low');
    expect(engine.generateValves([], 60_000, 120_000, CTX)).toEqual([]);
  });

  it('re-emits the tease close, but not the open, on a re-lay that starts mid-tease', () => {
    // A variety change in the first 10 s calls invalidateFuture, which drops the
    // future close and re-pulls this overlay with fromTime = clock (>0). The
    // close@10_000 must still be regenerated, or the stroke-minus valve latches
    // open for the rest of the session. Re-emitting the open would re-apply the
    // tease from scratch.
    const engine = new CompanionEngine(20, 'low', 'low');
    expect(engine.generateValves([], 5000, 65_000, CTX)).toEqual([
      { kind: 'valve', at: 10_000, valve: 'minus', open: false },
    ]);
  });

  it('emits nothing on a re-lay starting at the end of the tease', () => {
    const engine = new CompanionEngine(20, 'low', 'low');
    expect(engine.generateValves([], 10_000, 70_000, CTX)).toEqual([]);
  });

  it('emits the one-shot suction pulse 3 s and 12 s into the cumming wind-down', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.beginCumming();
    // fromTime is the Player's clock, never 0 past the first window, so the
    // pulse has to be anchored to it rather than to session start.
    expect(engine.generateValves([], 1_000, 61_000, CTX)).toEqual([
      { kind: 'valve', at: 4_000, valve: 'minus', open: true },
      { kind: 'valve', at: 13_000, valve: 'minus', open: false },
    ]);
  });
});

describe('CompanionEngine.scale', () => {
  it('scales raw speed by the live speed percent', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    const event: SpeedEvent = { kind: 'speed', at: 0, speed: 60 };
    expect(engine.scale(event, CTX)).toBe(30);
    engine.setSpeedPercent(100);
    expect(engine.scale(event, CTX)).toBe(60);
  });

  it('passes unscaled events through untouched', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    const event: SpeedEvent = {
      kind: 'speed',
      at: 0,
      speed: 25,
      unscaled: true,
    };
    expect(engine.scale(event, CTX)).toBe(25);
  });
});
