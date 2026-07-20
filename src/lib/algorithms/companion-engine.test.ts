import { describe, expect, it } from "@jest/globals";
import type { PlayerContext, SpeedEvent } from "../program";
import { CompanionEngine } from "./companion-engine";

// Contract tests (see program.ts): generation is random by design, so these pin
// the guarantees the Player relies on, not exact output.

const CTX: PlayerContext = { clock: 0, currentSpeed: 0, currentRawSpeed: 0 };

describe("CompanionEngine.generateSpeed", () => {
  it("always extends past fromTime, sorted, in pattern space", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    let from = 0;
    // Walk several look-ahead batches the way the Player does.
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
      // A batch ending at or before fromTime would spin the Player's loop.
      expect(lastAt).toBeGreaterThan(from);
      from = lastAt;
    }
  });

  it("emits the finish ramp once (unscaled) then parks", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.beginFinish();
    const ramp = engine.generateSpeed(0, 60_000, CTX);
    expect(ramp.length).toBeGreaterThan(0);
    expect(ramp.every((e) => e.unscaled === true)).toBe(true);
    // Parked: nothing more until something changes.
    expect(engine.generateSpeed(60_000, 120_000, CTX)).toEqual([]);
  });

  it("resumes generating after reset() clears a finish", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.beginFinish();
    engine.generateSpeed(0, 60_000, CTX);
    engine.reset();
    expect(engine.generateSpeed(0, 60_000, CTX).length).toBeGreaterThan(0);
  });
});

describe("CompanionEngine.generateValves", () => {
  it("emits no valves when suction is off", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    const speed = engine.generateSpeed(0, 60_000, CTX);
    expect(engine.generateValves(speed, 0, 60_000, CTX)).toEqual([]);
  });

  it("pulses stroke-minus on moves when suction is on, respecting the interval", () => {
    const engine = new CompanionEngine("high", "moderate", "more");
    const speed = engine.generateSpeed(0, 60_000, CTX);
    const valves = engine.generateValves(speed, 0, 60_000, CTX);
    expect(valves.length).toBeGreaterThan(0);
    // Every valve action is on the minus (stroke) valve.
    expect(valves.every((v) => v.valve === "minus")).toBe(true);
    // Pulses are open/close pairs.
    const opens = valves.filter((v) => v.open);
    const closes = valves.filter((v) => !v.open);
    expect(opens.length).toBe(closes.length);
    // Consecutive opens are at least the "more" interval (2000 ms) apart.
    const openTimes = opens.map((v) => v.at);
    for (let i = 1; i < openTimes.length; i++) {
      expect(openTimes[i]! - openTimes[i - 1]!).toBeGreaterThanOrEqual(2000);
    }
  });

  it("closes both valves during finish", () => {
    const engine = new CompanionEngine("medium", "moderate", "more");
    engine.beginFinish();
    expect(engine.generateValves([], 0, 60_000, CTX)).toEqual([
      { kind: "valve", at: 0, valve: "minus", open: false },
      { kind: "valve", at: 0, valve: "plus", open: false },
    ]);
  });
});

describe("CompanionEngine.scale", () => {
  it("passes speed through unchanged (no magnitude knob)", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    const event: SpeedEvent = { kind: "speed", at: 0, speed: 73 };
    expect(engine.scale(event)).toBe(73);
  });
});

describe("CompanionEngine.generateNarrationCues", () => {
  it("fires cues on real template boundaries, labelled and in-window", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    const speed = engine.generateSpeed(0, 300_000, CTX);
    const cues = engine.generateNarrationCues(0, 300_000);
    expect(cues.length).toBeGreaterThan(1); // several across the window

    const speedTimes = new Set(speed.map((e) => e.at));
    let lastAt = -1;
    for (const cue of cues) {
      // A cue always lands on a real boundary — i.e. a generated speed-event time.
      expect(speedTimes.has(cue.at)).toBe(true);
      expect(cue.text.length).toBeGreaterThan(0); // labelled
      expect(cue.at).toBeGreaterThanOrEqual(lastAt); // sorted
      lastAt = cue.at;
      expect(cue.at).toBeGreaterThanOrEqual(0);
      expect(cue.at).toBeLessThan(300_000);
    }
  });

  it("draws every label from a small fixed set (the template table)", () => {
    const engine = new CompanionEngine("high", "intense", "off");
    engine.generateSpeed(0, 300_000, CTX);
    const cues = engine.generateNarrationCues(0, 300_000);
    const distinct = new Set(cues.map((c) => c.text));
    // Eight templates → at most eight distinct labels, all non-empty.
    expect(distinct.size).toBeLessThanOrEqual(8);
    for (const label of distinct) expect(label.length).toBeGreaterThan(0);
  });

  it("windows cues to [from, until)", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.generateSpeed(0, 180_000, CTX);
    const all = engine.generateNarrationCues(0, 180_000);
    const tail = engine.generateNarrationCues(60_000, 180_000);
    expect(tail.every((c) => c.at >= 60_000 && c.at < 180_000)).toBe(true);
    expect(tail.length).toBeLessThan(all.length);
  });

  it("emits a single finish cue while finishing", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.beginFinish();
    const cues = engine.generateNarrationCues(0, 60_000);
    expect(cues.length).toBe(1);
    expect(cues[0]!.text.length).toBeGreaterThan(0);
    expect(cues[0]!.at).toBe(0);
  });

  it("clears cues on reset()", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.generateSpeed(0, 120_000, CTX);
    expect(engine.generateNarrationCues(0, 120_000).length).toBeGreaterThan(0);
    engine.reset();
    expect(engine.generateNarrationCues(0, 120_000)).toEqual([]);
  });
});
