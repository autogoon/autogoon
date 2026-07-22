import { describe, expect, it } from "@jest/globals";
import type { PlayerContext, SpeedEvent } from "../program";
import { CompanionEngine } from "./companion-engine";

// Contract tests (see program.ts): generation is random by design, so these pin
// the guarantees the Player relies on, not exact output.

const CTX: PlayerContext = { clock: 0, currentSpeed: 0, currentRawSpeed: 0 };

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

  it("resumes from the device's current speed after a knob change", () => {
    const engine = new CompanionEngine(50, "medium", "medium");
    engine.setVariability("high");
    const ctx: PlayerContext = {
      clock: 0,
      currentSpeed: 0,
      currentRawSpeed: 37,
    };
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
