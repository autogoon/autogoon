// Goon as an AlgorithmEngine — an automatic, timeline-driven slow build. It IS
// the manual Groove dip pattern with its two knobs driven automatically over a
// "program position" that runs 0 -> 30 min, translated onto the shared Player's
// event model. The Player owns the clock, rate (time dilation), lookahead, sends
// and valve timing; this only *generates* events and *scales* them.
//
// The core simplification: **position === the Player's clock**. Goon's build runs
// over program-position 0..PROGRAM_MS; in this model the Player's clock IS that
// position and the Player's rate IS the old time dilation. So each generated cycle
// samples the curves at ITS OWN position (== its program-time), which keeps the
// ramp smooth and correct even after a jump — forward/back/finish/faster/slower are
// all just the Player moving/consuming the clock, with no engine-side transport.
//
//   - the dip is always the raw pattern 100 -> floor -> 100 (Groove's shape),
//     mapped to the device through Groove's curved-low-end scaleSpeed. Depth
//     lives in RAW units, so it is wide and the legs are long early on.
//   - the auto SPEED (Groove's speedPercent) eases up from 25 -> 100 over the
//     30 minutes — this is the "build".
//   - the auto VARIABILITY decreases: the raw dip floor rises 50 -> 100 (deep
//     teasing dips -> no dip) and the timing jitter falls 80 -> 0, so it starts
//     with long, deep, slow, randomised dips and finishes as a steady hold.
// Because the dip is raw 100->floor and scaleSpeed pulls the low end toward 0 the
// lower the speed, the early low-speed dips still swing over a wide device range
// (e.g. ~25 down to ~3) rather than a narrow band near the top.
//
// Intensity (0-100, manual, default set by the hook) is a FINAL multiplier on the
// scaled output — so "build to 50%" just means intensity 50; scale() applies it
// every tick so a knob change takes effect on the next tick without regeneration.
// Auto teasing is emitted as open/close valve pulse PAIRS placed deterministically
// at their program positions. cumming() is Groove's wind-down, duplicated so
// this engine stays self-contained; the hook invalidates the future after it.

import {
  type PlayerContext,
  type ProgramEvent,
  type AlgorithmEngine,
  type SpeedEvent,
  type ValveEvent,
} from "@/lib/program";

// The whole build runs over this long. Position is clamped to [0, PROGRAM_MS];
// past the end the pattern parks at the top forever. Exported for the hook, which
// uses it for the position readout and for "finish" (seekTo the end).
export const PROGRAM_MS = 30 * 60_000;

// The auto "build" — Groove's speedPercent — eases from BUILD_START to
// BUILD_PEAK across the program. BUILD_EXP > 1 makes it ease-IN: a patient start
// that accelerates toward the finish (1 would be a straight line). BUILD_START is
// 25 (not 0) so the very start still swings up to ~25% at full intensity.
const BUILD_START = 25;
const BUILD_PEAK = 100;
const BUILD_EXP = 1.3;

// Variability endpoints, in RAW units like Groove. At position 0 the dip floor
// is VAR_FLOOR_DEEP (a deep 100->50 dip) with VAR_JITTER_HIGH timing randomisation;
// both interpolate linearly to "no dip (floor 100), no jitter" at the end.
const VAR_FLOOR_DEEP = 50;
const VAR_FLOOR_SHALLOW = 100;
const VAR_JITTER_HIGH = 80;

// Shared dip mechanics (same values as Groove, duplicated to stay standalone).
const STEP_MS = 1250;
const STEP_SIZE = 5;
const SLOW_JITTER_CAP = 40;
const PEAK_SPEED = 100;

// scaleSpeed's low-end curve (Groove's LOW_END_GAMMA): the exponent grows as
// the speed falls, pulling the dip's low point toward 0 so slow settings still
// get a wide range instead of a narrow band near the top. 0 would be flat linear.
const LOW_END_GAMMA = 2.5;

// Auto teasing has two phases. Before STROKE_PLUS_START_MS it fires a 5s stroke-
// minus pulse every STROKE_MINUS_INTERVAL_MS (a minute), starting at 0; from then
// on it fires a stroke+ pulse every TEASE_INTERVAL_MS (five minutes), except in the
// final segment (last TEASE_INTERVAL_MS) so nothing interrupts the approach.
const STROKE_PLUS_START_MS = 10 * 60_000;
const STROKE_MINUS_INTERVAL_MS = 60_000;
const STROKE_MINUS_PULSE_MS = 5000;
const TEASE_INTERVAL_MS = 5 * 60_000;
const TEASE_PULSE_MS = 100;

// cumming()'s wind-down ramp, verbatim from the old engine.
const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 5;
const CUMMING_STEP_MS = 500; // 1 unit per 500ms: 30 units over 15s.

// The far-future hold used for the end-of-program park and the cumming rest: the
// event array wraps onto it and holds, so nothing needs to track "are we done".
const PARK_HOLD_MS = 1_800_000;

// The helpers below are deliberately module-level functions, not private methods
// of the class: they are pure, stateless transforms, kept file-private (never
// exported). Matching the sibling engines (see groove-engine.ts), keeping them
// as functions avoids handing stateless code a `this` it does not use.

interface Waypoint {
  speed: number;
  at: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const roundToStep = (v: number): number =>
  Math.round(v / STEP_SIZE) * STEP_SIZE;

// Normalised progress 0..1 at a program position (ms).
function progress(positionMs: number): number {
  return clamp01(positionMs / PROGRAM_MS);
}

// The auto build (Groove's speedPercent) at a position — eased 25 -> 100.
function buildSpeedPercent(positionMs: number): number {
  const eased = Math.pow(progress(positionMs), BUILD_EXP);
  return lerp(BUILD_START, BUILD_PEAK, eased);
}

// The raw dip floor (Groove's variability floor) at a position: VAR_FLOOR_DEEP
// -> VAR_FLOOR_SHALLOW, snapped to a whole STEP_SIZE so the 100->floor legs divide
// into whole steps. At the end floor === 100, so the dip collapses to a hold.
function variabilityFloor(positionMs: number): number {
  return roundToStep(
    lerp(VAR_FLOOR_DEEP, VAR_FLOOR_SHALLOW, progress(positionMs)),
  );
}

// Timing jitter percent at a position: VAR_JITTER_HIGH -> 0.
function variabilityJitter(positionMs: number): number {
  return lerp(VAR_JITTER_HIGH, 0, progress(positionMs));
}

// Groove's scaleSpeed, verbatim: map a raw pattern speed (floor..100) to the
// pre-intensity device value. The peak (raw 100) scales linearly to speedPercent;
// lower raw speeds are pulled toward 0 harder as the speed falls, via an exponent
// that grows from 1 (at full speed) upward as speedPercent drops.
function scaleSpeed(raw: number, speedPercent: number): number {
  if (speedPercent <= 0) return 0;
  const exponent = 1 + LOW_END_GAMMA * (1 - speedPercent / 100);
  return Math.round(speedPercent * Math.pow(raw / PEAK_SPEED, exponent));
}

// One ramp's waypoints: a leading waypoint at `from` then a step every stepMs to
// `to`. All steps share one random duration (one draw per ramp, asymmetric: up to
// `variabilityPercent` faster but at most SLOW_JITTER_CAP slower) so a ramp reads
// as "this ramp is quicker/slower", not step-to-step jitter. A zero-length leg
// (from === to) still consumes a step so the clock advances during a hold.
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

// One dip cycle: the raw Groove pattern PEAK_SPEED -> floor -> PEAK_SPEED
// (floor and jitter sampled from the variability curves at `positionMs`), with
// every raw waypoint mapped through scaleSpeed at this position's build level. The
// stored speeds are therefore the pre-intensity device values (scale() applies
// intensity on top). When the floor reaches PEAK_SPEED (end of program) both legs
// are zero-length, so it becomes a hold at the top — how "no variability" falls out.
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

// A one-shot, unscaled wind-down: a smooth constant-rate ramp from 30 to 5 (1.5/
// step down to 20, then 1/step to 5), then a duplicate of the resting value (0)
// far in the future — the loop wraps onto that far-future waypoint and holds.
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
  events.push({ kind: "speed", at: at + PARK_HOLD_MS, speed: 0, unscaled: true });
  return events;
}

// The stroke-minus / stroke-plus tease pulses as open/close ValveEvent pairs,
// placed deterministically at their program positions in [from, until). This
// replaces the old maybeTease's per-tick lastMinusIndex/lastPlusIndex crossing
// logic: because position is deterministic, the same boundaries fall out of a
// position-keyed placement with no per-phase state.
//   - stroke-minus: at each k*STROKE_MINUS_INTERVAL_MS with pos < STROKE_PLUS_START_MS
//     (fires at 0,1,…,9 min) — a STROKE_MINUS_PULSE_MS pulse.
//   - stroke-plus: at each k*TEASE_INTERVAL_MS with pos >= STROKE_PLUS_START_MS AND
//     pos < PROGRAM_MS - TEASE_INTERVAL_MS (fires at 10,15,20 min) — a TEASE_PULSE_MS
//     pulse. Matches the old maybeTease guards' exact boundaries.
// `until` is the batch's cycle extent (not the raw lookahead horizon): the Player
// pulls generate() with `from` advancing to the previous batch's last event, so
// keying on the actual cycle extent keeps tease coverage contiguous with the
// speed cycles — no gaps, no re-emission across calls or after jumps.
function teaseEvents(from: number, until: number): ValveEvent[] {
  const events: ValveEvent[] = [];

  const minusStart = Math.max(0, Math.floor(from / STROKE_MINUS_INTERVAL_MS));
  for (let k = minusStart; ; k++) {
    const pos = k * STROKE_MINUS_INTERVAL_MS;
    if (pos >= until) break;
    if (pos >= STROKE_PLUS_START_MS) break; // guard; pos only grows from here
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
    if (pos >= PROGRAM_MS - TEASE_INTERVAL_MS) break; // guard; pos only grows
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

export interface GoonOptions {
  intensity: number;
}

export class Goon implements AlgorithmEngine {
  // Final output multiplier (0-100). The Intensity slider owns this.
  private intensity: number;
  private cumming = false;
  private cummingEmitted = false;

  constructor(opts: GoonOptions) {
    this.intensity = opts.intensity;
  }

  reset(): void {
    this.cumming = false;
    this.cummingEmitted = false;
  }

  // Update the final multiplier. No invalidate — scale() reads it every tick, so
  // the change takes effect on the next tick without regeneration.
  setIntensity(percent: number): void {
    this.intensity = Math.max(0, Math.min(100, percent));
  }

  // Groove's wind-down. The hook calls invalidateFuture() after this while
  // playing, so generate() emits the ramp + stroke-minus pulse once.
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
      // Past the end of the build, park: a hold at the top now and a duplicate
      // far in the future, so the loop wraps onto it and holds forever (mirrors
      // the old end-of-program park; cumming's far-future hold sits past this and
      // is never regenerated because this parks first).
      if (at >= PROGRAM_MS) {
        events.push({ kind: "speed", at, speed: PEAK_SPEED });
        events.push({ kind: "speed", at: at + PARK_HOLD_MS, speed: PEAK_SPEED });
        parked = true;
        parkAt = at;
        break;
      }
      // Each cycle samples the curves at its OWN start position (== program-time),
      // so the ramp is smooth and correct even after a jump.
      const { waypoints, endAt } = buildGoonCycle(at, at);
      for (const wp of waypoints) {
        events.push({ kind: "speed", at: wp.at, speed: wp.speed });
      }
      at = endAt;
    }

    // Tease over the batch's actual cycle extent, so pulses stay contiguous with
    // the speed cycles and never re-emit across calls (see teaseEvents).
    const teaseUntil = parked ? parkAt : at;
    events.push(...teaseEvents(fromTime, teaseUntil));

    events.sort((a, b) => a.at - b.at);
    return events;
  }

  // Intensity is a flat final multiplier (the pattern targets raw 100 internally;
  // intensity scales what's sent). cumming's unscaled waypoints pass through.
  scale(event: SpeedEvent): number {
    return event.unscaled === true
      ? event.speed
      : Math.round((event.speed * this.intensity) / 100);
  }

  // Groove's wind-down, duplicated: unscaled ramp 30 -> ... -> 5, park at 0 far
  // in the future, plus a stroke-minus pulse from +3s to +12s (a 9s pulse). Sorted
  // by `at` because the valve pulse interleaves with the ramp.
  private cummingEvents(startAt: number): ProgramEvent[] {
    const events: ProgramEvent[] = [...buildCummingScript(startAt)];
    events.push({ kind: "valve", at: startAt + 3000, valve: "minus", open: true });
    events.push({
      kind: "valve",
      at: startAt + 12000,
      valve: "minus",
      open: false,
    });
    return events.sort((a, b) => a.at - b.at);
  }
}
