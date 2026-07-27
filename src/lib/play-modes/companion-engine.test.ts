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

  it("resumes from the device's current speed after a knob change", () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.setVariability('high');
    const ctx: PlayerContext = { clock: 0, currentRawSpeed: 37 };
    const events = engine.generateSpeed(0, 60_000, ctx);
    expect(events[0]!.speed).toBe(37);
  });
});

// How long the stroke-minus tease runs is the engine's to tune, so the re-lay
// cases read it off the window covering session start rather than naming it.
const teaseClose = (): number =>
  new CompanionEngine(20, 'low', 'low').generateValves([], 0, 60_000, CTX)[1]!
    .at;

describe('CompanionEngine.generateValves', () => {
  it('emits only the start stroke-minus tease on the window covering start', () => {
    const engine = new CompanionEngine(20, 'low', 'low');
    const valves = engine.generateValves([], 0, 60_000, CTX);
    expect(valves.map((v) => [v.valve, v.open])).toEqual([
      ['minus', true],
      ['minus', false],
    ]);
    expect(valves[0]!.at).toBe(0);
    expect(valves[1]!.at).toBeGreaterThan(0);
  });

  it('emits nothing on a mid-session window', () => {
    const engine = new CompanionEngine(20, 'low', 'low');
    expect(engine.generateValves([], 60_000, 120_000, CTX)).toEqual([]);
  });

  it('re-emits the tease close, at the instant it first had, on a re-lay that starts mid-tease', () => {
    // A variety change during the tease calls invalidateFuture, which drops the
    // future close and re-pulls this overlay with fromTime = clock (>0). The
    // same close must come back, or the stroke-minus valve latches open for the
    // rest of the session. Re-emitting the open would re-apply the tease from
    // scratch.
    const close = teaseClose();
    const engine = new CompanionEngine(20, 'low', 'low');
    expect(
      engine.generateValves([], close / 2, close / 2 + 60_000, CTX),
    ).toEqual([{ kind: 'valve', at: close, valve: 'minus', open: false }]);
  });

  it('emits nothing on a re-lay starting at the end of the tease', () => {
    const close = teaseClose();
    const engine = new CompanionEngine(20, 'low', 'low');
    expect(engine.generateValves([], close, close + 60_000, CTX)).toEqual([]);
  });

  it('anchors the cumming suction pulse to the window start, not to session start', () => {
    // fromTime is the Player's clock, never 0 past the first window. Anchored
    // to session start, a wind-down beginning well into a session would emit
    // its pulse in the past and the valve would never open. How far into the
    // wind-down the pulse sits is the engine's to tune; that it tracks fromTime
    // is not.
    const pulse = (from: number) => {
      const engine = new CompanionEngine(50, 'medium', 'medium');
      engine.beginCumming();
      return engine.generateValves([], from, from + 60_000, CTX);
    };
    const early = pulse(1_000);
    const late = pulse(30_000);
    expect(early.map((v) => v.at - 1_000)).toEqual(
      late.map((v) => v.at - 30_000),
    );
    expect(early.map((v) => [v.valve, v.open])).toEqual([
      ['minus', true],
      ['minus', false],
    ]);
    expect(early[0]!.at).toBeGreaterThan(1_000);
    expect(early[1]!.at).toBeGreaterThan(early[0]!.at);
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
