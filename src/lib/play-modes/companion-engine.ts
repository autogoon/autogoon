// CompanionEngine — the motion backbone for the Companions play mode. A faithful,
// self-contained port of GrooveEngine's dip generation (PEAK -> floor -> PEAK,
// with a live Speed% magnitude knob and timing/dip Variability shape knobs),
// duplicated rather than imported because engines don't import each other (see
// ARCHITECTURE.md; Goon duplicates Groove for the same reason). One companion-only
// addition over Groove: a one-shot stroke-minus tease held at session start
// (ported from Goon's STROKE_MINUS_APPLY_MS). Everything Autopilot-shaped is gone
// — the template blocks, edge/suction knobs, and the boundary-based narration
// overlay. The chattiness-paced ambient-chat cues are a later phase (Phase 7),
// generated here once a chattiness knob and an orchestrator consumer exist; there
// is no narration overlay in the meantime. Pure event generation/scaling: no
// React, no device, no LLM, no personas.

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
// The deepest a dip may reach, per level, in pattern space (100 = no dip, the
// device holds at the peak; 0 = a full stop). off holds at the peak — no dip at
// all — and each level up dips deeper, evenly spaced down to a full stop at high.
const DIP_FLOOR: Record<VariabilityLevel, number> = {
  off: 100,
  low: 66,
  medium: 33,
  high: 0,
};
// Skews the drawn floor toward the deep end. 1 is flat/uniform; above that deep
// dips get commoner. Endpoints don't move.
const DIP_SKEW = 2;
// A leg (PEAK -> floor, or floor -> PEAK) takes this long when variability is 0.
// Variability can only ever shorten it.
const BASELINE_LEG_MS = 10_000;
// Skews the random leg duration toward the short end.
const LEG_TIME_SKEW = 3;
// The device takes discrete speed commands, so a ramp is sampled into events —
// one send about this often.
const STEP_INTERVAL_MS = 1000;
// Speed steps within a leg are curved, not evenly spaced: interpolate in
// s^(1/RAMP_GAMMA) space and invert, so the ramp takes big strides near the top
// and fine ones near the bottom.
const RAMP_GAMMA = 2;
const PEAK_SPEED = 100;
const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 5;
const CUMMING_STEP_MS = 500;
// One-shot stroke-minus tease held for this long at session start (ported from
// Goon's STROKE_MINUS_APPLY_MS). A teasing lead-in, independent of the dip
// pattern, re-derived per window so it only fires on the window covering start.
const STROKE_TEASE_MS = 10_000;

interface Ramp {
  waypoints: Array<{ speed: number; at: number }>;
  endAt: number;
}

// Every dip draws its own floor, between the level's deepest reach and the peak
// (no dip), skewed toward the deep end by DIP_SKEW. off pins it to the peak — no
// dip at all — while each level up lets more dips fall closer to its deep reach.
function drawFloor(dipLevel: VariabilityLevel): number {
  const deepest = DIP_FLOOR[dipLevel];
  const span = PEAK_SPEED - deepest;
  return Math.round(deepest + span * Math.pow(Math.random(), DIP_SKEW));
}

// One ramp of a dip. The leg gets a single random duration for its whole length,
// drawn from [BASELINE_LEG_MS * (1 - variability), BASELINE_LEG_MS], skewed
// toward the short end by LEG_TIME_SKEW. A deeper dip ramps steeper, not longer.
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
  // A zero-length leg (from === to) still consumes its leg time, or the cycle
  // collapses to zero duration and generateSpeed's own tiling loop never
  // returns, building empty cycles at the same instant forever.
  if (from === to) return { waypoints, endAt: startAt + Math.round(legMs) };
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
// up-leg share the same bottom. `fromSpeed` lets a cycle that resumes after a
// knob change start from wherever the device already is rather than snapping to
// the peak first.
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

export class CompanionEngine implements PlayModeEngine {
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

  // Valves: the one-shot stroke-minus tease over the window covering session
  // start, and the one-shot suction pulse that rides the cumming wind-down.
  // Both are pure functions of the window (no cadence state), so the Player can
  // re-lay the overlay.
  generateValves(
    _speedEvents: SpeedEvent[],
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): ValveEvent[] {
    if (this.cumming) {
      return [
        { kind: 'valve', at: fromTime + 3000, valve: 'minus', open: true },
        { kind: 'valve', at: fromTime + 12000, valve: 'minus', open: false },
      ];
    }
    // The one-shot stroke-minus tease. The open fires once at session start; the
    // close must survive a mid-tease re-lay — a variety change in the first
    // STROKE_TEASE_MS calls invalidateFuture, which drops the future close and
    // re-pulls this overlay with fromTime = clock (>0). So emit the close on any
    // window overlapping [0, STROKE_TEASE_MS), but the open only on the window
    // covering start — otherwise the valve latches open for the rest of the run.
    if (fromTime < STROKE_TEASE_MS && untilTime > 0) {
      const valves: ValveEvent[] = [];
      if (fromTime <= 0) {
        valves.push({ kind: 'valve', at: 0, valve: 'minus', open: true });
      }
      valves.push({
        kind: 'valve',
        at: STROKE_TEASE_MS,
        valve: 'minus',
        open: false,
      });
      return valves;
    }
    return [];
  }

  scale(event: SpeedEvent, _ctx?: PlayerContext): number {
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
