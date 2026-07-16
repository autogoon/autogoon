import { describe, expect, it } from "@jest/globals";
import type { PlayerContext, SpeedEvent } from "../program";
import { GoonEngine } from "./goon-engine";

// Contract tests for the engine (see program.ts): generation is random by
// design, so these pin the guarantees the Player relies on, not exact output.

const CTX: PlayerContext = { clock: 0, currentSpeed: 0, currentRawSpeed: 0 };

describe("GoonEngine.generateSpeed", () => {
  it("always extends past fromTime, sorted, in pattern space", () => {
    const engine = new GoonEngine(50);
    let from = 0;
    // Walk several look-ahead batches the way the Player does.
    for (let i = 0; i < 10; i++) {
      const until = from + 60_000;
      const events = engine.generateSpeed(from, until, CTX);
      expect(events.length).toBeGreaterThan(0);

      let lastAt = from;
      for (const event of events) {
        // Sorted non-decreasing, all within [fromTime, …).
        expect(event.at).toBeGreaterThanOrEqual(lastAt);
        lastAt = event.at;
        expect(event.speed).toBeGreaterThanOrEqual(0);
        expect(event.speed).toBeLessThanOrEqual(100);
      }
      // Progress guarantee: a batch ending at or before fromTime would make
      // the Player's look-ahead loop spin.
      expect(lastAt).toBeGreaterThan(from);
      from = lastAt;
    }
  });

  it("emits the wind-down once when cumming, then parks", () => {
    const engine = new GoonEngine(50);
    engine.beginCumming();

    const windDown = engine.generateSpeed(0, 60_000, CTX);
    expect(windDown.length).toBeGreaterThan(0);
    // The send-off ramp must be unscaled so an intensity ceiling can't shrink
    // it (see "generateSpeed pitfalls" in DEVELOPERS.md).
    expect(windDown.every((e) => e.unscaled === true)).toBe(true);

    // Parked: nothing more until something changes.
    expect(engine.generateSpeed(60_000, 120_000, CTX)).toEqual([]);
  });

  it("scales the build to the configured session length", () => {
    const short = new GoonEngine(100);
    short.setProgramMs(10 * 60_000);
    // Past the configured end the build parks, holding at top speed…
    const parked = short.generateSpeed(10 * 60_000, 11 * 60_000, CTX);
    expect(parked.length).toBeGreaterThan(0);
    expect(parked.every((e) => e.speed === 100)).toBe(true);

    // …while the default 30-minute build at the same position is still
    // mid-ramp, its dips sitting well under the top.
    const midBuild = new GoonEngine(100).generateSpeed(
      10 * 60_000,
      12 * 60_000,
      CTX,
    );
    expect(midBuild.some((e) => e.speed < 100)).toBe(true);
  });

  it("resumes generating after reset() clears a cumming session", () => {
    const engine = new GoonEngine(50);
    engine.beginCumming();
    engine.generateSpeed(0, 60_000, CTX);

    engine.reset();
    expect(engine.generateSpeed(0, 60_000, CTX).length).toBeGreaterThan(0);
  });
});

describe("GoonEngine.scale", () => {
  const event = (speed: number, unscaled?: boolean): SpeedEvent => ({
    kind: "speed",
    at: 0,
    speed,
    ...(unscaled === true ? { unscaled } : {}),
  });

  it("applies intensity as a percentage, rounded", () => {
    const engine = new GoonEngine(50);
    expect(engine.scale(event(80))).toBe(40);
    expect(engine.scale(event(25))).toBe(13); // 12.5 rounds up
  });

  it("passes unscaled events through untouched", () => {
    const engine = new GoonEngine(10);
    expect(engine.scale(event(80, true))).toBe(80);
  });

  it("clamps setIntensity to 0..100", () => {
    const engine = new GoonEngine(50);
    engine.setIntensity(150);
    expect(engine.scale(event(80))).toBe(80);
    engine.setIntensity(-10);
    expect(engine.scale(event(80))).toBe(0);
  });
});
