// Groove as a PlayModeEngine — the manual dip pattern (100 -> floor -> 100)
// with Speed + Variability knobs. Pure event generation/scaling — no React, no
// device; generation helpers are private to this file.

import {
  type PlayerContext,
  type PlayModeEngine,
  type SpeedEvent,
  type ValveEvent,
} from '@/lib/program';

export type VariabilityLevel = 'off' | 'low' | 'medium' | 'high';

// How much a leg's duration can be randomly shortened, per level.
const TIMING_PERCENT: Record<VariabilityLevel, number> = {
  off: 0,
  low: 25,
  medium: 50,
  high: 75,
};
// The standard dip: every dip bottoms out at least this low. With dip
// variability off, it is exactly where every dip lands.
const STANDARD_FLOOR = 60;
// How deep a dip may go, per level. The floor is drawn between the level's
// minimum and STANDARD_FLOOR, so a higher level only ever adds depth.
const DIP_FLOOR: Record<VariabilityLevel, number> = {
  off: STANDARD_FLOOR,
  low: 40,
  medium: 20,
  high: 0,
};
// Skews the drawn floor toward the deep end, exactly as LEG_TIME_SKEW does for
// leg times. 1 is a flat, uniform draw; above that deep dips get commoner and
// shallow ones rarer. Endpoints don't move. Mean floor is deepest + span /
// (DIP_SKEW + 1).
const DIP_SKEW = 2;
// A leg (PEAK -> floor, or floor -> PEAK) takes this long when variability is 0.
// Variability can only ever shorten it, never stretch it past this baseline.
const BASELINE_LEG_MS = 10_000;
// Skews the random leg duration toward the short end. 1 is a flat, uniform draw;
// every step above that makes fast legs commoner and slow legs rarer. Only the
// distribution shifts — the endpoints are fixed by BASELINE_LEG_MS and the
// variability level. Mean leg time is shortest + span / (LEG_TIME_SKEW + 1).
const LEG_TIME_SKEW = 3;
// The device takes discrete speed commands, so a ramp has to be sampled into
// events. Sample on time: aim for one send about this often. Exactness doesn't
// matter — a user won't notice the difference between 0.8s and 1.2s, and it sits
// well inside the device's rate limit.
const STEP_INTERVAL_MS = 1000;
// Speed steps within a leg are spaced on a curve, not evenly: a 5-unit change at
// speed 10 is felt far more than the same change at speed 90. So the ramp takes
// big strides near the top and fine ones near the bottom. Interpolate in
// s^(1/RAMP_GAMMA) space and invert. 1 is linear; above 1 packs the detail into
// the low end. Works in either direction, since it curves speed, not time.
const RAMP_GAMMA = 2;
const PEAK_SPEED = 100;
const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 0;
const CUMMING_STEP_MS = 500;

interface Ramp {
  waypoints: Array<{ speed: number; at: number }>;
  endAt: number;
}

// Every dip draws its own floor, between the level's deepest reach and the
// standard floor, skewed toward the deep end by DIP_SKEW. Off pins it to the
// standard floor; each level up only adds depth, never takes the dip away.
function drawFloor(dipLevel: VariabilityLevel): number {
  const deepest = DIP_FLOOR[dipLevel];
  const span = STANDARD_FLOOR - deepest;
  return Math.round(deepest + span * Math.pow(Math.random(), DIP_SKEW));
}

// One ramp of a dip. The leg gets a single random duration for its whole length,
// drawn from [BASELINE_LEG_MS * (1 - variability), BASELINE_LEG_MS] — so
// variability reads directly as "how much a leg can be shortened by". A deeper
// dip ramps steeper rather than taking longer.
//
// The draw is skewed toward the short end by LEG_TIME_SKEW rather than flat: a
// second's difference matters far more at 3s than at 9s, and slow legs all feel
// much alike, so the interesting fast ones should come up more often.
function buildLeg(
  from: number,
  to: number,
  variabilityPercent: number,
  startAt: number,
): Ramp {
  const variability = variabilityPercent / 100;
  const shortestMs = BASELINE_LEG_MS * (1 - variability);
  const legMs =
    shortestMs +
    (BASELINE_LEG_MS - shortestMs) * Math.pow(Math.random(), LEG_TIME_SKEW);
  const waypoints: Array<{ speed: number; at: number }> = [
    { speed: from, at: startAt },
  ];
  // A zero-length leg (from === to — e.g. no dip at all once the floor reaches
  // the peak) still has to consume its leg time, or the cycle collapses to zero
  // duration and the Player's look-ahead loop spins forever building empty ones.
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

function toSpeedEvents(
  waypoints: Array<{ speed: number; at: number }>,
): SpeedEvent[] {
  return waypoints.map((w) => ({ kind: 'speed', at: w.at, speed: w.speed }));
}

// One dip. The floor is drawn once here, not per leg, so the down-leg and the
// up-leg share the same bottom; each leg then draws its own duration. `fromSpeed`
// exists for the cycle that resumes after a knob change: it starts the dip from
// wherever the device already is rather than snapping to the peak first. (If that
// speed sits below the drawn floor the "down"-leg is really a climb, which is
// harmless — it just ramps to the floor.)
function buildFullCycle(
  dipLevel: VariabilityLevel,
  variabilityPercent: number,
  startAt: number,
  fromSpeed: number = PEAK_SPEED,
): { events: SpeedEvent[]; endAt: number } {
  const events: SpeedEvent[] = [];
  let at = startAt;
  const floor = drawFloor(dipLevel);
  for (const leg of [
    { from: fromSpeed, to: floor },
    { from: floor, to: PEAK_SPEED },
  ]) {
    const { waypoints, endAt } = buildLeg(
      leg.from,
      leg.to,
      variabilityPercent,
      at,
    );
    events.push(...toSpeedEvents(waypoints));
    at = endAt;
  }
  return { events, endAt: at };
}

// Intensity is a plain linear scale on the raw pattern, so a raw floor of 60 at
// intensity 10 lands on 6. Anything that shapes the dip belongs in the raw
// pattern, not here.
function scaleSpeed(raw: number, speedPercent: number): number {
  return Math.round((raw * speedPercent) / PEAK_SPEED);
}

export class GrooveEngine implements PlayModeEngine {
  private speedPercent: number;
  private variabilityLevel: VariabilityLevel;
  private dipLevel: VariabilityLevel;
  // Set when a knob changes: the next dip picks up from the device's current
  // speed instead of snapping back to the peak.
  private startFromCurrent = false;
  private cumming = false;
  private cummingEmitted = false;

  constructor(
    speedPercent: number,
    variability: VariabilityLevel,
    dip: VariabilityLevel,
  ) {
    this.speedPercent = speedPercent;
    this.variabilityLevel = variability;
    this.dipLevel = dip;
  }

  private get variabilityPercent(): number {
    return TIMING_PERCENT[this.variabilityLevel];
  }

  reset(): void {
    this.startFromCurrent = false;
    this.cumming = false;
    this.cummingEmitted = false;
  }

  setSpeedPercent(percent: number): void {
    this.speedPercent = Math.max(0, Math.min(100, percent));
  }

  setVariability(level: VariabilityLevel): void {
    this.variabilityLevel = level;
    this.startFromCurrent = true;
  }

  setDipVariability(level: VariabilityLevel): void {
    this.dipLevel = level;
    this.startFromCurrent = true;
  }

  beginCumming(): void {
    this.cumming = true;
    this.cummingEmitted = false;
  }

  generateSpeed(
    fromTime: number,
    untilTime: number,
    ctx: PlayerContext,
  ): SpeedEvent[] {
    if (this.cumming) {
      if (this.cummingEmitted) return [];
      this.cummingEmitted = true;
      return this.cummingSpeed(fromTime);
    }
    const events: SpeedEvent[] = [];
    let at = fromTime;
    if (this.startFromCurrent) {
      this.startFromCurrent = false;
      const cycle = buildFullCycle(
        this.dipLevel,
        this.variabilityPercent,
        at,
        ctx.currentRawSpeed,
      );
      events.push(...cycle.events);
      at = cycle.endAt;
    }
    while (at < untilTime) {
      const cycle = buildFullCycle(this.dipLevel, this.variabilityPercent, at);
      events.push(...cycle.events);
      at = cycle.endAt;
    }
    return events;
  }

  // Groove has no scheduled valves — its only valve action is the one-shot pulse
  // that rides the cumming wind-down.
  generateValves(
    _speedEvents: SpeedEvent[],
    fromTime: number,
    _untilTime: number,
    _ctx: PlayerContext,
  ): ValveEvent[] {
    if (this.cumming) {
      return [
        { kind: 'valve', at: fromTime + 3000, valve: 'minus', open: true },
        { kind: 'valve', at: fromTime + 12000, valve: 'minus', open: false },
      ];
    }
    return [];
  }

  scale(event: SpeedEvent): number {
    if (event.unscaled === true) return event.speed;
    return scaleSpeed(event.speed, this.speedPercent);
  }

  private cummingSpeed(startAt: number): SpeedEvent[] {
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
      at: at + 1_800_000,
      speed: 0,
      unscaled: true,
    });
    return events;
  }
}
