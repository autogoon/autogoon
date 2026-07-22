import { describe, expect, it } from "@jest/globals";
import type { PlayerContext, SpeedEvent } from "../program";
import { CompanionEngine } from "./companion-engine";

// Contract tests (see program.ts): generation is random by design, so these pin
// the guarantees the Player relies on, not exact output.

const CTX: PlayerContext = { clock: 0, currentRawSpeed: 0 };

describe("CompanionEngine.generateSpeed", () => {
  it("always extends past fromTime, sorted, in pattern space", () => {
    const engine = new CompanionEngine(50, "medium", "medium");
    let from = 0;
    for (let i = 0; i < 10; i++) {
      const until = from + 60_000;
      const events = engine.generateSpeed(from, until, CTX);
      expect(events.length).toBeGreaterThan(0);
      let lastAt = from;
      for (const event of events) {
        expect(event.at).toBeGreaterThanOrEqual(lastAt);
        lastAt = event.at;
        expect(event.speed).toBeGreaterThanOrEqual(0);
        expect(event.speed).toBeLessThanOrEqual(100);
      }
      expect(lastAt).toBeGreaterThan(from);
      from = lastAt;
    }
  });

  it("emits the cumming wind-down once (unscaled) then parks", () => {
    const engine = new CompanionEngine(50, "medium", "medium");
    engine.beginCumming();
    const ramp = engine.generateSpeed(0, 60_000, CTX);
    expect(ramp.length).toBeGreaterThan(0);
    expect(ramp.every((e) => e.unscaled === true)).toBe(true);
    expect(engine.generateSpeed(60_000, 120_000, CTX)).toEqual([]);
  });

  it("resumes generating after reset() clears a cumming", () => {
    const engine = new CompanionEngine(50, "medium", "medium");
    engine.beginCumming();
    engine.generateSpeed(0, 60_000, CTX);
    engine.reset();
    expect(engine.generateSpeed(0, 60_000, CTX).length).toBeGreaterThan(0);
  });

  it("holds at the peak with no dip when variety is off", () => {
    // off = no dip: the floor is pinned to the peak, so every raw speed sits at
    // the peak (pre-scale). Variety off drives both shape knobs to off.
    const engine = new CompanionEngine(50, "off", "off");
    const events = engine.generateSpeed(0, 60_000, CTX);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.speed === 100)).toBe(true);
  });

  it("can dip all the way to a full stop at high", () => {
    // high's deepest reach is 0, so across a long window at least one dip floor
    // should bottom out very low. (Deterministic enough over many cycles.)
    const engine = new CompanionEngine(100, "high", "high");
    const events = engine.generateSpeed(0, 600_000, CTX);
    expect(Math.min(...events.map((e) => e.speed))).toBeLessThanOrEqual(5);
  });

  it("resumes from the device's current speed after a knob change", () => {
    const engine = new CompanionEngine(50, "medium", "medium");
    engine.setVariability("high");
    const ctx: PlayerContext = { clock: 0, currentRawSpeed: 37 };
    const events = engine.generateSpeed(0, 60_000, ctx);
    expect(events[0]!.speed).toBe(37);
  });
});

describe("CompanionEngine.generateValves", () => {
  it("emits only the start stroke-minus tease on the window covering start", () => {
    const engine = new CompanionEngine(20, "low", "low");
    const speed = engine.generateSpeed(0, 60_000, CTX);
    expect(engine.generateValves(speed, 0, 60_000, CTX)).toEqual([
      { kind: "valve", at: 0, valve: "minus", open: true },
      { kind: "valve", at: 10_000, valve: "minus", open: false },
    ]);
  });

  it("emits nothing on a mid-session window", () => {
    const engine = new CompanionEngine(20, "low", "low");
    expect(engine.generateValves([], 60_000, 120_000, CTX)).toEqual([]);
  });

  it("re-emits the tease close on a re-lay that starts mid-tease", () => {
    // A knob change in the first 10s calls invalidateFuture, which drops the
    // future close and re-pulls this overlay with fromTime = clock (>0). The
    // close@10_000 must still be regenerated, or the stroke-minus valve latches
    // open for the rest of the session. The open is NOT re-emitted (it already
    // fired at t=0).
    const engine = new CompanionEngine(20, "low", "low");
    expect(engine.generateValves([], 5000, 65_000, CTX)).toEqual([
      { kind: "valve", at: 10_000, valve: "minus", open: false },
    ]);
    // A re-lay that starts at or after the tease is done emits nothing.
    expect(engine.generateValves([], 10_000, 70_000, CTX)).toEqual([]);
  });

  it("emits the one-shot suction pulse riding the cumming wind-down", () => {
    const engine = new CompanionEngine(50, "medium", "medium");
    engine.beginCumming();
    expect(engine.generateValves([], 0, 60_000, CTX)).toEqual([
      { kind: "valve", at: 3000, valve: "minus", open: true },
      { kind: "valve", at: 12000, valve: "minus", open: false },
    ]);
  });
});

describe("CompanionEngine.scale", () => {
  it("scales raw speed by the live speed percent", () => {
    const engine = new CompanionEngine(50, "medium", "medium");
    const event: SpeedEvent = { kind: "speed", at: 0, speed: 60 };
    expect(engine.scale(event, CTX)).toBe(30);
    engine.setSpeedPercent(100);
    expect(engine.scale(event, CTX)).toBe(60);
  });

  it("passes unscaled events through untouched", () => {
    const engine = new CompanionEngine(50, "medium", "medium");
    const event: SpeedEvent = {
      kind: "speed",
      at: 0,
      speed: 25,
      unscaled: true,
    };
    expect(engine.scale(event, CTX)).toBe(25);
  });
});
