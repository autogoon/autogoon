// Goon as an AlgorithmEngine — an automatic, timeline-driven slow build: the
// manual Groove dip pattern with its knobs driven automatically over a
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

// The auto "build" — Groove's Intensity — eases from BUILD_START to BUILD_PEAK
// across the program (BUILD_EXP > 1 => ease-in). BUILD_START is 25 so the start
// still swings up to ~25% at full intensity.
const BUILD_START = 25;
const BUILD_PEAK = 100;
const BUILD_EXP = 1.3;

// The dip has two parts. Over the first DIP_VARIABILITY_MS, Groove's dip
// variability knob is swept from "high" down to "off". Then the remaining time is a
// taper: the dip itself flattens away to leave the hold at the top. Timing
// variability keeps its own schedule, spanning the whole program (see
// timingPercent), so the legs are still losing their snap through the taper.
const DIP_VARIABILITY_MS = 25 * 60_000;

// Timing variability: how much of a leg's baseline duration may be randomly cut.
const TIMING_PERCENT_HIGH = 75;
const TIMING_PERCENT_OFF = 0;
// Dip variability: how deep a dip may reach. Every dip bottoms out at least as low
// as the standard floor; at "high" it may reach all the way down to DEEPEST_FLOOR.
const STANDARD_FLOOR = 60;
const DEEPEST_FLOOR = 0;

// Shared dip mechanics — the same values as Groove, duplicated to keep the engine
// standalone (see ARCHITECTURE.md: engines don't import each other).

// Skews the drawn floor toward the deep end. 1 is a flat, uniform draw; above
// that deep dips get commoner and shallow ones rarer. Endpoints don't move.
const DIP_SKEW = 2;
// A leg (PEAK -> floor, or floor -> PEAK) takes this long when timing variability
// is 0. Variability can only ever shorten it, never stretch it past this baseline.
const BASELINE_LEG_MS = 10_000;
// Skews the random leg duration toward the short end, so the interesting fast
// legs come up more often than the slow ones that all feel much alike.
const LEG_TIME_SKEW = 3;
// The device takes discrete speed commands, so a ramp has to be sampled into
// events. Sample on time: aim for one send about this often. Exactness doesn't
// matter, and it sits well inside the device's rate limit.
const STEP_INTERVAL_MS = 1000;
// Speed steps within a leg are spaced on a curve, not evenly: a 5-unit change at
// speed 10 is felt far more than the same change at speed 90. Interpolate in
// s^(1/RAMP_GAMMA) space and invert, so the ramp takes big strides near the top
// and fine ones near the bottom.
const RAMP_GAMMA = 2;
const PEAK_SPEED = 100;

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

// The curves that define the build, each sampled at a program position. These are
// the automatic stand-ins for Groove's three manual knobs.

// Program position as a 0..1 fraction (clamped, so anything past the end reads 1).
function progress(positionMs: number): number {
  return clamp01(positionMs / PROGRAM_MS);
}

// Position within the dip-variability window, as a 0..1 fraction. Reads 1 for the
// whole taper, so the dip curve sits at "off" once it starts.
function dipVariabilityProgress(positionMs: number): number {
  return clamp01(positionMs / DIP_VARIABILITY_MS);
}

// Position within the taper, as a 0..1 fraction: 0 until dip variability is spent,
// then rising to 1 at the end of the program.
function taperProgress(positionMs: number): number {
  return clamp01(
    (positionMs - DIP_VARIABILITY_MS) / (PROGRAM_MS - DIP_VARIABILITY_MS),
  );
}

// The auto "speed" knob: eased BUILD_START -> BUILD_PEAK across the program, right
// through the taper.
function buildSpeedPercent(positionMs: number): number {
  const eased = Math.pow(progress(positionMs), BUILD_EXP);
  return lerp(BUILD_START, BUILD_PEAK, eased);
}

// How low a dip bottoms out when dip variability has nothing to add. Fixed at
// STANDARD_FLOOR through the dip-variability window, then lifted to the peak across
// the taper — so the dip shrinks to nothing and the program ends holding at top.
function standardFloor(positionMs: number): number {
  return lerp(STANDARD_FLOOR, PEAK_SPEED, taperProgress(positionMs));
}

// The auto "dip variability" knob: the deepest a dip may reach at this position.
// It rises from DEEPEST_FLOOR to the standard floor over the dip-variability
// window, so early dips can plunge all the way to a standstill and by the end of
// that window every dip is the standard 100 -> 60. Through the taper it tracks
// the standard floor, collapsing the draw's span to zero.
function deepestFloor(positionMs: number): number {
  const standard = standardFloor(positionMs);
  return lerp(DEEPEST_FLOOR, standard, dipVariabilityProgress(positionMs));
}

// The auto "timing variability" knob: how much a leg's duration may be cut. High at
// the start, easing to 0 only at the very end of the program — unlike dip
// variability, which is spent well before that. So the pace keeps a little lurch
// through the taper, and it's the last legs of all that finally run their full,
// unhurried length.
function timingPercent(positionMs: number): number {
  return lerp(TIMING_PERCENT_HIGH, TIMING_PERCENT_OFF, progress(positionMs));
}

// Every dip draws its own floor, between the deepest reach allowed at this
// position and the standard floor, skewed toward the deep end by DIP_SKEW. In the
// taper the two coincide, so the floor is just the tapered value.
function drawFloor(positionMs: number): number {
  const deepest = deepestFloor(positionMs);
  const span = standardFloor(positionMs) - deepest;
  return Math.round(deepest + span * Math.pow(Math.random(), DIP_SKEW));
}

// Map a raw dip speed (0..100 pattern space) to a device speed under the current
// build speed. A plain linear scale, so a raw floor of 20 under a build speed of
// 50 lands on 10. Anything that shapes the dip belongs in the raw pattern.
function scaleSpeed(raw: number, speedPercent: number): number {
  return Math.round((raw * speedPercent) / PEAK_SPEED);
}

// One ramp of a dip. The leg gets a single random duration for its whole length,
// drawn from [BASELINE_LEG_MS * (1 - variability), BASELINE_LEG_MS] — so
// variability reads directly as "how much a leg can be shortened by". A deeper dip
// ramps steeper rather than taking longer. The draw is skewed toward the short end
// by LEG_TIME_SKEW. Returns the waypoints plus the time the leg ends, so
// successive legs and cycles chain back to back.
function buildLeg(
  from: number,
  to: number,
  variabilityPercent: number,
  startAt: number,
): { waypoints: Waypoint[]; endAt: number } {
  const variability = variabilityPercent / 100;
  const shortestMs = BASELINE_LEG_MS * (1 - variability);
  const legMs =
    shortestMs +
    (BASELINE_LEG_MS - shortestMs) * Math.pow(Math.random(), LEG_TIME_SKEW);
  const waypoints: Waypoint[] = [{ speed: from, at: startAt }];
  // A zero-length leg (from === to) still has to consume its leg time, or the
  // cycle collapses to zero duration and the Player's look-ahead loop spins
  // forever building empty ones.
  if (from === to) return { waypoints, endAt: startAt + Math.round(legMs) };
  // How many sends the leg is cut into is a function of its duration, not of how
  // far it travels. A leg shorter than one interval collapses to a single jump —
  // there is nothing to ramp through in under a second. Steps are evenly spaced in
  // time but curved in speed (see RAMP_GAMMA); interpolating that way still lands
  // the last waypoint exactly on `to`, with rounding absorbing the remainder.
  const steps = Math.max(1, Math.round(legMs / STEP_INTERVAL_MS));
  const stepMs = Math.max(1, Math.round(legMs / steps));
  const curvedFrom = Math.pow(from, 1 / RAMP_GAMMA);
  const curvedTo = Math.pow(to, 1 / RAMP_GAMMA);
  let at = startAt;
  for (let i = 1; i <= steps; i++) {
    at += stepMs;
    const curved = curvedFrom + ((curvedTo - curvedFrom) * i) / steps;
    waypoints.push({ speed: Math.round(Math.pow(curved, RAMP_GAMMA)), at });
  }
  return { waypoints, endAt: at };
}

// One full dip cycle at this program position. Sample the build speed and both
// variability curves here, then build the raw Groove dip PEAK -> floor -> PEAK as
// two legs, mapping every waypoint through scaleSpeed so the whole dip sits under
// the current build speed. The floor is drawn once per cycle, not per leg, so the
// down-leg and the up-leg share the same bottom. Early on this is a deep, slow,
// wide swing; near the end it settles into a shallow bob at the top. Sampling at
// positionMs (the live clock) is what keeps the ramp correct after a jump.
function buildGoonCycle(
  positionMs: number,
  startAt: number,
): { waypoints: Waypoint[]; endAt: number } {
  const speedPercent = buildSpeedPercent(positionMs);
  const variabilityPercent = timingPercent(positionMs);
  const floor = drawFloor(positionMs);
  const legs: ReadonlyArray<{ from: number; to: number }> = [
    { from: PEAK_SPEED, to: floor },
    { from: floor, to: PEAK_SPEED },
  ];
  const waypoints: Waypoint[] = [];
  let at = startAt;
  for (const leg of legs) {
    const built = buildLeg(leg.from, leg.to, variabilityPercent, at);
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
