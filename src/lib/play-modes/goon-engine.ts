// Goon as a PlayModeEngine — an automatic, timeline-driven slow build: the
// manual Groove dip pattern with its knobs driven automatically over a
// program-position running 0 -> the configured session length. position === the
// Player's clock, so each cycle samples the curves at its own program-time and
// the ramp stays correct after a jump. Pure event generation/scaling — no React,
// no device.

import {
  type PlayerContext,
  type PlayModeEngine,
  type SpeedEvent,
  type ValveEvent,
} from '@/lib/program';

// How long the whole build runs by default; the live value is the engine's
// programMs, set from the panel's session-length setting before a session
// starts. The curves scale to fit — a shorter session compresses the ramp, a
// longer one stretches it. Position is clamped to [0, programMs]; past the end
// the pattern parks at the top forever.
export const DEFAULT_PROGRAM_MS = 30 * 60_000;

// The auto "build" — Groove's Intensity — eases from BUILD_START to BUILD_PEAK
// across the program (BUILD_EXP > 1 => ease-in). BUILD_START is 25 so the start
// still swings up to ~25% at full intensity.
const BUILD_START = 25;
const BUILD_PEAK = 100;
const BUILD_EXP = 1.3;

// The dip has two parts. Over the first DIP_VARIABILITY_FRACTION of the session,
// Groove's dip variability knob is swept from "high" down to "off". Then the
// remaining time is a taper: the dip itself flattens away to leave the hold at
// the top. Timing variability keeps its own schedule, spanning the whole session
// (see timingPercent), so the legs are still losing their snap through the taper.
const DIP_VARIABILITY_FRACTION = 25 / 30;

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

// Auto teasing: one stroke-minus application right at session start.
const STROKE_MINUS_APPLY_MS = 10_000;

// cumming()'s wind-down ramp.
const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 5;
const CUMMING_STEP_MS = 400;

// After-play: what `cumming` splices in, picked at random from the options
// enabled in setup. Wind-down is the classic ramp above; the other three are
// one-shot outcomes the panel makes unstoppable (Stop is ignored once they
// start — the safe word is the backstop).
export type AfterPlayOption = 'wind-down' | 'torture' | 'stay-in' | 'eject';

// The canonical option list (display order) — the panel validates restored
// storage against it.
export const AFTER_PLAY_OPTIONS: readonly AfterPlayOption[] = [
  'wind-down',
  'torture',
  'stay-in',
  'eject',
];

// The eject recipe, established by experiment: this speed with the stroke+
// valve held open for this long pushes you out.
const EJECT_SPEED = 40;
const EJECT_MS = 15_000;

// Past the end of the session the build is over and Goon holds at top speed.
// Emit that hold one minute at a time (extended by the normal lookahead) rather
// than as a single far-future event, so the tail stays a uniform stream.
const PARK_STEP_MS = 60_000;

// The far-future hold used for the cumming rest.
const PARK_HOLD_MS = 1_800_000;

interface Waypoint {
  speed: number;
  at: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// The curves that define the build, each sampled at a program position expressed
// as a 0..1 fraction of the session (`t`, clamped — anything past the end reads
// 1). Working in fractions is what makes the build scale to fit any session
// length. These are the automatic stand-ins for Groove's three manual knobs.

// Position within the dip-variability window, as a 0..1 fraction. Reads 1 for the
// whole taper, so the dip curve sits at "off" once it starts.
function dipVariabilityProgress(t: number): number {
  return clamp01(t / DIP_VARIABILITY_FRACTION);
}

// Position within the taper, as a 0..1 fraction: 0 until dip variability is spent,
// then rising to 1 at the end of the program.
function taperProgress(t: number): number {
  return clamp01(
    (t - DIP_VARIABILITY_FRACTION) / (1 - DIP_VARIABILITY_FRACTION),
  );
}

// The auto "speed" knob: eased BUILD_START -> BUILD_PEAK across the program, right
// through the taper.
function buildSpeedPercent(t: number): number {
  const eased = Math.pow(t, BUILD_EXP);
  return lerp(BUILD_START, BUILD_PEAK, eased);
}

// How low a dip bottoms out when dip variability has nothing to add. Fixed at
// STANDARD_FLOOR through the dip-variability window, then lifted to the peak across
// the taper — so the dip shrinks to nothing and the program ends holding at top.
function standardFloor(t: number): number {
  return lerp(STANDARD_FLOOR, PEAK_SPEED, taperProgress(t));
}

// The auto "dip variability" knob: the deepest a dip may reach at this position.
// It rises from DEEPEST_FLOOR to the standard floor over the dip-variability
// window, so early dips can plunge all the way to a standstill and by the end of
// that window every dip is the standard 100 -> 60. Through the taper it tracks
// the standard floor, collapsing the draw's span to zero.
function deepestFloor(t: number): number {
  const standard = standardFloor(t);
  return lerp(DEEPEST_FLOOR, standard, dipVariabilityProgress(t));
}

// The auto "timing variability" knob: how much a leg's duration may be cut. High at
// the start, easing to 0 only at the very end of the program — unlike dip
// variability, which is spent well before that. So the pace keeps a little lurch
// through the taper, and it's the last legs of all that finally run their full,
// unhurried length.
function timingPercent(t: number): number {
  return lerp(TIMING_PERCENT_HIGH, TIMING_PERCENT_OFF, t);
}

// Every dip draws its own floor, between the deepest reach allowed at this
// position and the standard floor, skewed toward the deep end by DIP_SKEW. In the
// taper the two coincide, so the floor is just the tapered value.
function drawFloor(t: number): number {
  const deepest = deepestFloor(t);
  const span = standardFloor(t) - deepest;
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
  // cycle collapses to zero duration and generateSpeed's own tiling loop never
  // returns, building empty cycles at the same instant forever.
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

// One full dip cycle at this program position (`t`, a 0..1 fraction of the
// session). Sample the build speed and both variability curves here, then build
// the raw Groove dip PEAK -> floor -> PEAK as two legs, mapping every waypoint
// through scaleSpeed so the whole dip sits under the current build speed. The
// floor is drawn once per cycle, not per leg, so the down-leg and the up-leg
// share the same bottom. Early on this is a deep, slow, wide swing; near the end
// it settles into a shallow bob at the top. Sampling at the live clock's position
// is what keeps the ramp correct after a jump.
function buildGoonCycle(
  t: number,
  startAt: number,
): { waypoints: Waypoint[]; endAt: number } {
  const speedPercent = buildSpeedPercent(t);
  const variabilityPercent = timingPercent(t);
  const floor = drawFloor(t);
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
    events.push({ kind: 'speed', at, speed, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  for (let speed = CUMMING_MID_SPEED; speed >= CUMMING_END_SPEED; speed--) {
    events.push({ kind: 'speed', at, speed, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  events.push({
    kind: 'speed',
    at: at + PARK_HOLD_MS,
    speed: 0,
    unscaled: true,
  });
  return events;
}

// The automatic tease overlay: a single stroke-minus application at session
// start, held for STROKE_MINUS_APPLY_MS. A pure function of the window, so it can
// be re-derived for any span (see generateValves): only the window that starts at
// position 0 emits it, so adjacent windows don't emit it twice.
function teaseEvents(from: number, until: number): ValveEvent[] {
  if (from > 0 || until <= 0) return [];
  return [
    { kind: 'valve', at: 0, valve: 'minus', open: true },
    {
      kind: 'valve',
      at: STROKE_MINUS_APPLY_MS,
      valve: 'minus',
      open: false,
    },
  ];
}

export class GoonEngine implements PlayModeEngine {
  private intensity: number;
  private programMs = DEFAULT_PROGRAM_MS;
  private cumming = false;
  private cummingEmitted = false;
  private afterPlayOptions: AfterPlayOption[] = ['wind-down'];
  private afterPlay: AfterPlayOption | null = null;

  constructor(intensity: number) {
    this.intensity = intensity;
  }

  reset(): void {
    this.cumming = false;
    this.cummingEmitted = false;
    this.afterPlay = null;
  }

  setIntensity(percent: number): void {
    this.intensity = Math.max(0, Math.min(100, percent));
  }

  // Session length — a setup-time setting, set before a session is armed (the
  // build scales to fit). Deliberately not survivable mid-run: nothing rescales
  // already-generated events. Floored at a minute so a bad value can't collapse
  // the build to nothing.
  setProgramMs(ms: number): void {
    this.programMs = Math.max(60_000, ms);
  }

  // The enabled after-play outcomes — a setup-time setting, like programMs.
  // Never empty: the panel gates Play on at least one being ticked, and an
  // empty list here would leave beginCumming with nothing to pick.
  setAfterPlayOptions(options: AfterPlayOption[]): void {
    if (options.length > 0) this.afterPlayOptions = [...options];
  }

  // The cumming point: pick the after-play at random from the enabled options
  // and return it, so the panel knows whether the outcome ignores Stop.
  beginCumming(): AfterPlayOption {
    this.cumming = true;
    this.cummingEmitted = false;
    this.afterPlay =
      this.afterPlayOptions[
        Math.floor(Math.random() * this.afterPlayOptions.length)
      ]!;
    return this.afterPlay;
  }

  // The speed backbone, filling [fromTime, untilTime) in whole cycles. Three
  // cases: once cumming, emit the chosen after-play's script once and then park
  // ([]); past the end of the build, hold at the top a step at a time; otherwise
  // tile dip cycles, each sampling the curves at its own start so the build
  // keeps ramping. Every after-play event is `unscaled` so the intensity
  // ceiling can't soften the outcome.
  generateSpeed(
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): SpeedEvent[] {
    if (this.cumming) {
      if (this.cummingEmitted) return [];
      this.cummingEmitted = true;
      switch (this.afterPlay) {
        case 'torture':
          // Straight to full and hold — the single event stays in effect
          // forever once the engine parks.
          return [
            { kind: 'speed', at: fromTime, speed: PEAK_SPEED, unscaled: true },
          ];
        case 'stay-in':
          // Stop dead, still seated; the valves close in generateValves so
          // the seal holds.
          return [{ kind: 'speed', at: fromTime, speed: 0, unscaled: true }];
        case 'eject':
          // Drive at the eject speed with stroke+ open (see generateValves)
          // long enough to push out, then rest.
          return [
            { kind: 'speed', at: fromTime, speed: EJECT_SPEED, unscaled: true },
            {
              kind: 'speed',
              at: fromTime + EJECT_MS,
              speed: 0,
              unscaled: true,
            },
          ];
        default:
          return buildCummingScript(fromTime);
      }
    }

    const events: SpeedEvent[] = [];
    let at = fromTime;
    while (at < untilTime) {
      if (at >= this.programMs) {
        events.push({ kind: 'speed', at, speed: PEAK_SPEED });
        at += PARK_STEP_MS;
        continue;
      }
      const { waypoints, endAt } = buildGoonCycle(
        clamp01(at / this.programMs),
        at,
      );
      for (const wp of waypoints) {
        events.push({ kind: 'speed', at: wp.at, speed: wp.speed });
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
      switch (this.afterPlay) {
        case 'torture':
        case 'stay-in':
          // A clean slate: both valves closed (stay-in keeps its seal, and a
          // generated close settles any manual stroke in flight).
          return [
            { kind: 'valve', at: fromTime, valve: 'minus', open: false },
            { kind: 'valve', at: fromTime, valve: 'plus', open: false },
          ];
        case 'eject':
          // Stroke+ held open for the whole push, then closed at rest.
          return [
            { kind: 'valve', at: fromTime, valve: 'minus', open: false },
            { kind: 'valve', at: fromTime, valve: 'plus', open: true },
            {
              kind: 'valve',
              at: fromTime + EJECT_MS,
              valve: 'plus',
              open: false,
            },
          ];
        default:
          // The one-shot suction pulse that rides the cumming wind-down.
          return [
            { kind: 'valve', at: fromTime + 3000, valve: 'minus', open: true },
            {
              kind: 'valve',
              at: fromTime + 12000,
              valve: 'minus',
              open: false,
            },
          ];
      }
    }
    // Auto teasing: only the window covering session start emits anything.
    return teaseEvents(fromTime, untilTime);
  }

  scale(event: SpeedEvent): number {
    return event.unscaled === true
      ? event.speed
      : Math.round((event.speed * this.intensity) / 100);
  }
}
