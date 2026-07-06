// Gooning Autopilot — an automatic, timeline-driven slow build. Unlike Homegrown
// (where Speed and Variability are manual knobs), here they are sampled from
// curves at a "program position" that runs 0 -> 30 min:
//   - the dip TOP eases up from 10 -> 100 (raw units) over the 30 minutes;
//   - Variability decreases: the dip floor rises from 50% -> 100% of the top and
//     the timing jitter falls from 80% -> 0, so it starts teasing and finishes
//     as a steady hold at the top.
// Intensity (0-100, manual, default set by the hook) is a FINAL multiplier on
// device output — the direct analogue of Homegrown's speedPercent — so "build to
// 50%" just means intensity 50. Real time advances the position 1:1; forward/back
// offset it by a minute; finish snaps it to the end (where it holds forever via a
// far-future waypoint, the same park trick as cumming). cumming() is Homegrown's
// wind-down, duplicated so this engine stays self-contained.
//
// `currentTime`/`script` are a permanent record of the session (never reset except
// on start()). We keep ~a minute of future built ahead, appending fresh cycles
// each tick; each appended cycle samples the curves at ITS OWN start position, so
// the ramp is smooth and correct even after a jump. An explicit command
// (forward/back/finish/cumming) splices from now — keeping sent waypoints as real
// history and rebuilding only the future.

import type { VacuglideDevice } from "@/lib/vacuglide-device";

interface ScriptWaypoint {
  speed: number;
  at: number;
  // If true, send `speed` as-is — bypass intensity scaling. Only cumming()'s
  // waypoints set this; the normal pattern never does.
  unscaled?: boolean;
}

// The whole build runs over this long. Position is clamped to [0, PROGRAM_MS];
// past the end the pattern holds at the top forever.
const PROGRAM_MS = 30 * 60_000;

// The dip top eases from START_BUILD to PEAK_BUILD (raw device units) across the
// program. EASE_EXPONENT > 1 makes it ease-IN: a patient start that accelerates
// toward the finish (1 would be a straight line).
const START_BUILD = 10;
const PEAK_BUILD = 100;
const EASE_EXPONENT = 1.6;

// Variability endpoints. At position 0 the floor sits at DEEP_FLOOR_FRACTION of
// the top (deep dips) with HIGH_JITTER timing randomisation; both interpolate
// linearly to "no dip, no jitter" at the end.
const DEEP_FLOOR_FRACTION = 0.5;
const HIGH_JITTER = 80;

// Shared dip mechanics (same values as Homegrown, duplicated to stay standalone).
const TICK_MS = 100;
const STEP_MS = 1250;
const STEP_SIZE = 5;
const SLOW_JITTER_CAP = 40;
const PEAK_SPEED = 100;

// How far ahead we keep the script built before appending more.
const SCRIPT_LOOKAHEAD_MS = 60_000;

// forward/back jump this much program time; the tease fires each time position
// crosses a TEASE_INTERVAL_MS boundary (except in the final segment).
const JUMP_MS = 60_000;
const TEASE_INTERVAL_MS = 5 * 60_000;
const TEASE_PULSE_MS = 50;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const roundToStep = (v: number): number => Math.round(v / STEP_SIZE) * STEP_SIZE;

// Normalised progress 0..1 at a program position (ms).
function progress(positionMs: number): number {
  return clamp01(positionMs / PROGRAM_MS);
}

// The dip top (raw units) at a position — eased 10 -> 100, snapped to a whole
// STEP_SIZE so legs divide into whole steps.
function buildTop(positionMs: number): number {
  const eased = Math.pow(progress(positionMs), EASE_EXPONENT);
  return roundToStep(lerp(START_BUILD, PEAK_BUILD, eased));
}

// The dip floor as a fraction of the top: DEEP_FLOOR_FRACTION -> 1 (no dip).
function floorFraction(positionMs: number): number {
  return lerp(DEEP_FLOOR_FRACTION, 1, progress(positionMs));
}

// Timing jitter percent: HIGH_JITTER -> 0.
function jitterPercent(positionMs: number): number {
  return lerp(HIGH_JITTER, 0, progress(positionMs));
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
): { waypoints: ScriptWaypoint[]; endAt: number } {
  const down = variabilityPercent / 100;
  const up = Math.min(variabilityPercent, SLOW_JITTER_CAP) / 100;
  const jitter = -down + Math.random() * (down + up);
  const stepMs = Math.max(1, Math.round(STEP_MS * (1 + jitter)));
  const direction = to > from ? STEP_SIZE : -STEP_SIZE;
  const steps = Math.abs(to - from) / STEP_SIZE;
  const waypoints: ScriptWaypoint[] = [{ speed: from, at: startAt }];
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

// One dip cycle (top -> floor -> top), with top/floor/jitter sampled from the
// curves at `positionMs`. Both endpoints are whole STEP_SIZE multiples. When the
// floor rounds up to the top (late in the program) both legs are zero-length, so
// it becomes a hold at the top — exactly how "no variability" falls out.
function buildGooningCycle(
  positionMs: number,
  startAt: number,
): { waypoints: ScriptWaypoint[]; endAt: number } {
  const top = buildTop(positionMs);
  const floor = Math.min(top, roundToStep(top * floorFraction(positionMs)));
  const jitter = jitterPercent(positionMs);
  const legs: ReadonlyArray<{ from: number; to: number }> = [
    { from: top, to: floor },
    { from: floor, to: top },
  ];
  const waypoints: ScriptWaypoint[] = [];
  let at = startAt;
  for (const leg of legs) {
    const built = buildLeg(leg.from, leg.to, jitter, at);
    waypoints.push(...built.waypoints);
    at = built.endAt;
  }
  return { waypoints, endAt: at };
}

const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 5;
const CUMMING_STEP_MS = 500; // 1 unit per 500ms: 30 units over 15s.

// A one-shot, unscaled wind-down: a smooth constant-rate ramp from 30 to 0, then
// a duplicate of the resting value (0) far in the future — the loop wraps onto
// that far-future waypoint and holds, so nothing needs to track "are we done".
function buildCummingScript(startAt: number): ScriptWaypoint[] {
  const script: ScriptWaypoint[] = [];
  let at = startAt;
  for (let speed = CUMMING_START_SPEED; speed >= CUMMING_MID_SPEED; speed -= 1.5) {
    script.push({ speed, at, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  for (let speed = CUMMING_MID_SPEED; speed >= CUMMING_END_SPEED; speed--) {
    script.push({ speed, at, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  script.push({ speed: 0, at: at + 1_800_000, unscaled: true });
  return script;
}
