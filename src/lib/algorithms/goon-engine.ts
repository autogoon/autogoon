// Goon as an AlgorithmEngine — an automatic, timeline-driven slow build: the
// manual Groove dip pattern with its two knobs driven automatically over a
// program-position running 0 -> 30 min. position === the Player's clock, so each
// cycle samples the curves at its own program-time and the ramp stays correct
// after a jump. Pure event generation/scaling — no React, no device.

import {
  type PlayerContext,
  type ProgramEvent,
  type AlgorithmEngine,
  type SpeedEvent,
  type ValveEvent,
} from "@/lib/program";

// The whole build runs over this long. Position is clamped to [0, PROGRAM_MS];
// past the end the pattern parks at the top forever.
export const PROGRAM_MS = 30 * 60_000;

// The auto "build" — Groove's speedPercent — eases from BUILD_START to BUILD_PEAK
// across the program (BUILD_EXP > 1 => ease-in). BUILD_START is 25 so the start
// still swings up to ~25% at full intensity.
const BUILD_START = 25;
const BUILD_PEAK = 100;
const BUILD_EXP = 1.3;

// Variability endpoints, in RAW units like Groove: at position 0 a deep 100->50
// dip with high timing jitter, interpolating to "no dip, no jitter" at the end.
const VAR_FLOOR_DEEP = 50;
const VAR_FLOOR_SHALLOW = 100;
const VAR_JITTER_HIGH = 80;

// Shared dip mechanics (same values as Groove, duplicated to stay standalone).
const STEP_MS = 1250;
const STEP_SIZE = 5;
const SLOW_JITTER_CAP = 40;
const PEAK_SPEED = 100;

// scaleSpeed's low-end curve: the exponent grows as the speed falls, pulling the
// dip's low point toward 0 so slow settings still get a wide range.
const LOW_END_GAMMA = 2.5;

// Auto teasing: stroke-minus pulses every minute up to STROKE_PLUS_START_MS, then
// stroke-plus pulses every five minutes, except in the final segment.
const STROKE_PLUS_START_MS = 10 * 60_000;
const STROKE_MINUS_INTERVAL_MS = 60_000;
const STROKE_MINUS_PULSE_MS = 5000;
const TEASE_INTERVAL_MS = 5 * 60_000;
const TEASE_PULSE_MS = 100;

// cumming()'s wind-down ramp.
const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 5;
const CUMMING_STEP_MS = 500;

// The far-future hold used for the end-of-program park and the cumming rest.
const PARK_HOLD_MS = 1_800_000;

interface Waypoint {
  speed: number;
  at: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const roundToStep = (v: number): number =>
  Math.round(v / STEP_SIZE) * STEP_SIZE;

function progress(positionMs: number): number {
  return clamp01(positionMs / PROGRAM_MS);
}

function buildSpeedPercent(positionMs: number): number {
  const eased = Math.pow(progress(positionMs), BUILD_EXP);
  return lerp(BUILD_START, BUILD_PEAK, eased);
}

function variabilityFloor(positionMs: number): number {
  return roundToStep(
    lerp(VAR_FLOOR_DEEP, VAR_FLOOR_SHALLOW, progress(positionMs)),
  );
}

function variabilityJitter(positionMs: number): number {
  return lerp(VAR_JITTER_HIGH, 0, progress(positionMs));
}

function scaleSpeed(raw: number, speedPercent: number): number {
  if (speedPercent <= 0) return 0;
  const exponent = 1 + LOW_END_GAMMA * (1 - speedPercent / 100);
  return Math.round(speedPercent * Math.pow(raw / PEAK_SPEED, exponent));
}

function buildLeg(
  from: number,
  to: number,
  variabilityPercent: number,
  startAt: number,
): { waypoints: Waypoint[]; endAt: number } {
  const down = variabilityPercent / 100;
  const up = Math.min(variabilityPercent, SLOW_JITTER_CAP) / 100;
  const jitter = -down + Math.random() * (down + up);
  const stepMs = Math.max(1, Math.round(STEP_MS * (1 + jitter)));
  const direction = to > from ? STEP_SIZE : -STEP_SIZE;
  const steps = Math.abs(to - from) / STEP_SIZE;
  const waypoints: Waypoint[] = [{ speed: from, at: startAt }];
  let at = startAt;
  let speed = from;
  for (let i = 0; i < steps; i++) {
    speed += direction;
    at += stepMs;
    waypoints.push({ speed, at });
  }
  if (steps === 0) at += stepMs;
  return { waypoints, endAt: at };
}

function buildGoonCycle(
  positionMs: number,
  startAt: number,
): { waypoints: Waypoint[]; endAt: number } {
  const speedPercent = buildSpeedPercent(positionMs);
  const floor = variabilityFloor(positionMs);
  const jitter = variabilityJitter(positionMs);
  const legs: ReadonlyArray<{ from: number; to: number }> = [
    { from: PEAK_SPEED, to: floor },
    { from: floor, to: PEAK_SPEED },
  ];
  const waypoints: Waypoint[] = [];
  let at = startAt;
  for (const leg of legs) {
    const built = buildLeg(leg.from, leg.to, jitter, at);
    for (const wp of built.waypoints) {
      waypoints.push({ speed: scaleSpeed(wp.speed, speedPercent), at: wp.at });
    }
    at = built.endAt;
  }
  return { waypoints, endAt: at };
}

function buildCummingScript(startAt: number): SpeedEvent[] {
  const events: SpeedEvent[] = [];
  let at = startAt;
  for (
    let speed = CUMMING_START_SPEED;
    speed >= CUMMING_MID_SPEED;
    speed -= 1.5
  ) {
    events.push({ kind: "speed", at, speed, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  for (let speed = CUMMING_MID_SPEED; speed >= CUMMING_END_SPEED; speed--) {
    events.push({ kind: "speed", at, speed, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  events.push({
    kind: "speed",
    at: at + PARK_HOLD_MS,
    speed: 0,
    unscaled: true,
  });
  return events;
}

function teaseEvents(from: number, until: number): ValveEvent[] {
  const events: ValveEvent[] = [];

  const minusStart = Math.max(0, Math.floor(from / STROKE_MINUS_INTERVAL_MS));
  for (let k = minusStart; ; k++) {
    const pos = k * STROKE_MINUS_INTERVAL_MS;
    if (pos >= until) break;
    if (pos >= STROKE_PLUS_START_MS) break;
    if (pos < from) continue;
    events.push({ kind: "valve", at: pos, valve: "minus", open: true });
    events.push({
      kind: "valve",
      at: pos + STROKE_MINUS_PULSE_MS,
      valve: "minus",
      open: false,
    });
  }

  const plusStart = Math.max(0, Math.floor(from / TEASE_INTERVAL_MS));
  for (let k = plusStart; ; k++) {
    const pos = k * TEASE_INTERVAL_MS;
    if (pos >= until) break;
    if (pos >= PROGRAM_MS - TEASE_INTERVAL_MS) break;
    if (pos < from || pos < STROKE_PLUS_START_MS) continue;
    events.push({ kind: "valve", at: pos, valve: "plus", open: true });
    events.push({
      kind: "valve",
      at: pos + TEASE_PULSE_MS,
      valve: "plus",
      open: false,
    });
  }

  return events;
}

export class GoonEngine implements AlgorithmEngine {
  private intensity: number;
  private cumming = false;
  private cummingEmitted = false;

  constructor(intensity: number) {
    this.intensity = intensity;
  }

  reset(): void {
    this.cumming = false;
    this.cummingEmitted = false;
  }

  setIntensity(percent: number): void {
    this.intensity = Math.max(0, Math.min(100, percent));
  }

  beginCumming(): void {
    this.cumming = true;
    this.cummingEmitted = false;
  }

  generate(
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): ProgramEvent[] {
    if (this.cumming) {
      if (this.cummingEmitted) return [];
      this.cummingEmitted = true;
      return this.cummingEvents(fromTime);
    }

    const events: ProgramEvent[] = [];
    let at = fromTime;
    let parked = false;
    let parkAt = fromTime;
    while (at < untilTime) {
      if (at >= PROGRAM_MS) {
        events.push({ kind: "speed", at, speed: PEAK_SPEED });
        events.push({
          kind: "speed",
          at: at + PARK_HOLD_MS,
          speed: PEAK_SPEED,
        });
        parked = true;
        parkAt = at;
        break;
      }
      const { waypoints, endAt } = buildGoonCycle(at, at);
      for (const wp of waypoints) {
        events.push({ kind: "speed", at: wp.at, speed: wp.speed });
      }
      at = endAt;
    }

    const teaseUntil = parked ? parkAt : at;
    events.push(...teaseEvents(fromTime, teaseUntil));

    events.sort((a, b) => a.at - b.at);
    return events;
  }

  scale(event: SpeedEvent): number {
    return event.unscaled === true
      ? event.speed
      : Math.round((event.speed * this.intensity) / 100);
  }

  private cummingEvents(startAt: number): ProgramEvent[] {
    const events: ProgramEvent[] = [...buildCummingScript(startAt)];
    events.push({
      kind: "valve",
      at: startAt + 3000,
      valve: "minus",
      open: true,
    });
    events.push({
      kind: "valve",
      at: startAt + 12000,
      valve: "minus",
      open: false,
    });
    return events.sort((a, b) => a.at - b.at);
  }
}
