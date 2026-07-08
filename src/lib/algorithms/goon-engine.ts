// Goon as an AlgorithmEngine — an automatic, timeline-driven slow build: the
// manual Groove dip pattern with its two knobs driven automatically over a
// program-position running 0 -> 30 min. position === the Player's clock, so each
// cycle samples the curves at its own program-time and the ramp stays correct
// after a jump. Pure event generation/scaling — no React, no device.

import {
  type PlayerContext,
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
const CUMMING_STEP_MS = 400;

// Past PROGRAM_MS the build is over and Goon holds at top speed. Emit that hold
// one minute at a time (extended by the normal lookahead) rather than as a single
// far-future event, so the tail stays a uniform stream.
const PARK_STEP_MS = 60_000;

// The far-future hold used for the cumming rest.
const PARK_HOLD_MS = 1_800_000;

interface Waypoint {
  speed: number;
  at: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const roundToStep = (v: number): number =>
  Math.round(v / STEP_SIZE) * STEP_SIZE;

// The curves that define the build, each sampled at a program position. These are
// the automatic stand-ins for Groove's two manual knobs.

// Program position as a 0..1 fraction (clamped, so anything past the end reads 1).
function progress(positionMs: number): number {
  return clamp01(positionMs / PROGRAM_MS);
}

// The auto "speed" knob: eased BUILD_START -> BUILD_PEAK across the program.
function buildSpeedPercent(positionMs: number): number {
  const eased = Math.pow(progress(positionMs), BUILD_EXP);
  return lerp(BUILD_START, BUILD_PEAK, eased);
}

// The auto "variability" knob has two parts. The floor is how deep each dip goes:
// it rises from a deep 50 (a big 100->50 tease) to 100 (no dip) by the end.
function variabilityFloor(positionMs: number): number {
  return roundToStep(
    lerp(VAR_FLOOR_DEEP, VAR_FLOOR_SHALLOW, progress(positionMs)),
  );
}

// ...and the jitter is how much random stretch the dip timing gets: high early,
// fading to 0 so the finish is steady rather than ragged.
function variabilityJitter(positionMs: number): number {
  return lerp(VAR_JITTER_HIGH, 0, progress(positionMs));
}

// Map a raw dip speed (0..100 pattern space) to a device speed under the current
// build speedPercent. Not a flat multiply: the exponent grows as speedPercent
// falls, curving the low end down toward 0, so even slow early settings still dip
// over a wide range with long legs rather than a narrow band near the top.
function scaleSpeed(raw: number, speedPercent: number): number {
  if (speedPercent <= 0) return 0;
  const exponent = 1 + LOW_END_GAMMA * (1 - speedPercent / 100);
  return Math.round(speedPercent * Math.pow(raw / PEAK_SPEED, exponent));
}

// One ramp of a dip: step the speed from `from` to `to` in STEP_SIZE increments,
// one step every ~STEP_MS. The step timing gets a single random stretch/squeeze
// (jitter) for the whole leg so dips never feel metronomic — the size of that
// jitter grows with variabilityPercent, and slowing down (a downward leg) is
// capped tighter than speeding up (SLOW_JITTER_CAP). Returns the waypoints plus
// the time the leg ends, so successive legs and cycles chain back to back.
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
  // A zero-length leg (from === to — e.g. no dip once variability reaches the
  // top) must still advance time, or the cycle collapses to zero duration and the
  // Player's look-ahead loop spins forever building empty cycles.
  if (steps === 0) at += stepMs;
  return { waypoints, endAt: at };
}

// One full dip cycle at this program position. Sample the build speed and the
// variability (floor + jitter) here, then build the raw Groove dip PEAK -> floor
// -> PEAK as two legs, mapping every waypoint through scaleSpeed so the whole dip
// sits under the current build speed. Early on this is a deep, slow, wide swing;
// near the end it flattens toward a hold at the top. Sampling at positionMs (the
// live clock) is what keeps the ramp correct after a forward/back jump.
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

// The `cumming` send-off: a slow, deliberate glide down to a standstill. Ramp
// from CUMMING_START_SPEED in two phases — gentle -1.5 steps down to the mid
// speed, then -1 steps to the end speed — one step every CUMMING_STEP_MS, so the
// strokes visibly shorten as it winds down. A final speed-0 event parked far in
// the future (PARK_HOLD_MS) leaves the device at rest. Every event is `unscaled`
// so the intensity ceiling can't shrink the wind-down out from under itself.
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

// The automatic tease overlay: valve pulses laid across [from, until) in two
// phases. It walks fixed time grids rather than keeping state, so it's a pure
// function of the window and can be re-derived for any span (see generateValves):
//   - stroke-minus pulses every minute, only before STROKE_PLUS_START_MS (10 min);
//   - stroke-plus pulses every 5 min after that, suppressed in the final segment
//     (the last TEASE_INTERVAL_MS) so nothing interrupts the approach.
// Each pulse is an open event plus a later close. Grid positions before `from` are
// skipped so adjacent windows don't emit the same pulse twice.
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

  // The speed backbone, filling [fromTime, untilTime) in whole cycles. Three
  // cases: once cumming, emit the wind-down script once and then park ([]); past
  // the end of the build, hold at the top a step at a time; otherwise tile dip
  // cycles, each sampling the curves at its own start so the build keeps ramping.
  generateSpeed(
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): SpeedEvent[] {
    if (this.cumming) {
      if (this.cummingEmitted) return [];
      this.cummingEmitted = true;
      return buildCummingScript(fromTime);
    }

    const events: SpeedEvent[] = [];
    let at = fromTime;
    while (at < untilTime) {
      if (at >= PROGRAM_MS) {
        events.push({ kind: "speed", at, speed: PEAK_SPEED });
        at += PARK_STEP_MS;
        continue;
      }
      const { waypoints, endAt } = buildGoonCycle(at, at);
      for (const wp of waypoints) {
        events.push({ kind: "speed", at: wp.at, speed: wp.speed });
      }
      at = endAt;
    }
    return events;
  }

  generateValves(
    _speedEvents: SpeedEvent[],
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): ValveEvent[] {
    if (this.cumming) {
      // The one-shot suction pulse that rides the cumming wind-down.
      return [
        { kind: "valve", at: fromTime + 3000, valve: "minus", open: true },
        { kind: "valve", at: fromTime + 12000, valve: "minus", open: false },
      ];
    }
    // Auto teasing. teaseEvents caps itself at PROGRAM_MS, so passing the speed
    // batch's full extent (untilTime, huge once parked) is safe.
    return teaseEvents(fromTime, untilTime);
  }

  scale(event: SpeedEvent): number {
    return event.unscaled === true
      ? event.speed
      : Math.round((event.speed * this.intensity) / 100);
  }
}
