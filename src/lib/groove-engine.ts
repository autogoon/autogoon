// Groove as an AlgorithmEngine — the dip pattern (this file formerly held the
// Groove *engine*), translated onto the shared Player's event model. The Player
// owns the clock, lookahead, sends and cumming valve timing; this only *generates*
// events and *scales* them. Generation helpers are private to this file — algorithms
// do not share generation code.

import {
  type PlayerContext,
  type ProgramEvent,
  type AlgorithmEngine,
  type SpeedEvent,
} from "@/lib/program";

export type VariabilityLevel = "off" | "low" | "medium" | "high";

const VARIABILITY_FLOOR: Record<VariabilityLevel, number> = {
  off: 100,
  low: 85,
  medium: 65,
  high: 50,
};
const VARIABILITY_PERCENT: Record<VariabilityLevel, number> = {
  off: 0,
  low: 25,
  medium: 50,
  high: 80,
};
const SLOW_JITTER_CAP = 40;
const STEP_MS = 1250;
const STEP_SIZE = 5;
const PEAK_SPEED = 100;
const LOW_END_GAMMA = 2.5;
const RECOVERY_STEP = STEP_SIZE;
const RECOVERY_STEP_MS = 500;
const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 5;
const CUMMING_STEP_MS = 500;

// The helpers below are deliberately module-level functions, not private methods
// of the class: they are pure, stateless transforms, kept file-private (never
// exported). Matching the sibling engines (see goon-engine.ts), keeping them as
// functions avoids handing stateless code a `this` it does not use.

interface Ramp {
  waypoints: Array<{ speed: number; at: number }>;
  endAt: number;
}

// One ramp: a leading waypoint at `from`, then a step every stepMs to `to`. One
// random duration per ramp (asymmetric: up to variabilityPercent faster, at most
// SLOW_JITTER_CAP slower). A zero-length leg still consumes a step (a hold).
function buildLeg(
  from: number,
  to: number,
  variabilityPercent: number,
  startAt: number,
): Ramp {
  const down = variabilityPercent / 100;
  const up = Math.min(variabilityPercent, SLOW_JITTER_CAP) / 100;
  const jitter = -down + Math.random() * (down + up);
  const stepMs = Math.max(1, Math.round(STEP_MS * (1 + jitter)));
  const direction = to > from ? STEP_SIZE : -STEP_SIZE;
  const steps = Math.abs(to - from) / STEP_SIZE;
  const waypoints: Array<{ speed: number; at: number }> = [
    { speed: from, at: startAt },
  ];
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

function toSpeedEvents(
  waypoints: Array<{ speed: number; at: number }>,
): SpeedEvent[] {
  return waypoints.map((w) => ({ kind: "speed", at: w.at, speed: w.speed }));
}

// One full cycle: 100 -> floor -> 100.
function buildFullCycle(
  floor: number,
  variabilityPercent: number,
  startAt: number,
): { events: SpeedEvent[]; endAt: number } {
  const events: SpeedEvent[] = [];
  let at = startAt;
  for (const leg of [
    { from: PEAK_SPEED, to: floor },
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

// After a variability change: ramp from the current speed back up to the peak at
// a fixed 10 units/sec, then one full cycle at the new floor.
function buildRecovery(
  fromSpeed: number,
  floor: number,
  variabilityPercent: number,
  startAt: number,
): { events: SpeedEvent[]; endAt: number } {
  const events: SpeedEvent[] = [];
  let at = startAt;
  for (
    let speed = fromSpeed + RECOVERY_STEP;
    speed <= PEAK_SPEED;
    speed += RECOVERY_STEP
  ) {
    at += RECOVERY_STEP_MS;
    events.push({ kind: "speed", at, speed });
  }
  const cycle = buildFullCycle(floor, variabilityPercent, at);
  events.push(...cycle.events);
  return { events, endAt: cycle.endAt };
}

// Map a raw pattern speed (floor..100) to the device value: peak tracks
// speedPercent linearly; lower raw speeds are pulled toward 0 harder as the speed
// falls (exponent grows from 1 as speedPercent drops).
function scaleSpeed(raw: number, speedPercent: number): number {
  if (speedPercent <= 0) return 0;
  const exponent = 1 + LOW_END_GAMMA * (1 - speedPercent / 100);
  return Math.round(speedPercent * Math.pow(raw / PEAK_SPEED, exponent));
}

export interface GrooveOptions {
  speedPercent: number;
  variability: VariabilityLevel;
}

export class Groove implements AlgorithmEngine {
  private speedPercent: number;
  private variabilityLevel: VariabilityLevel;
  private pendingRecovery = false;
  private cumming = false;
  private cummingEmitted = false;

  constructor(opts: GrooveOptions) {
    this.speedPercent = opts.speedPercent;
    this.variabilityLevel = opts.variability;
  }

  private get floor(): number {
    return VARIABILITY_FLOOR[this.variabilityLevel];
  }
  private get variabilityPercent(): number {
    return VARIABILITY_PERCENT[this.variabilityLevel];
  }

  reset(): void {
    this.pendingRecovery = false;
    this.cumming = false;
    this.cummingEmitted = false;
  }

  // Magnitude knob: scale() picks it up next tick, no regeneration.
  setSpeedPercent(percent: number): void {
    this.speedPercent = Math.max(0, Math.min(100, percent));
  }

  // Shape knob: the hook calls invalidateFuture() after this while playing, so
  // generate() emits a recovery ramp then the new-depth cycles.
  setVariability(level: VariabilityLevel): void {
    this.variabilityLevel = level;
    this.pendingRecovery = true;
  }

  beginCumming(): void {
    this.cumming = true;
    this.cummingEmitted = false;
  }

  generate(
    fromTime: number,
    untilTime: number,
    ctx: PlayerContext,
  ): ProgramEvent[] {
    if (this.cumming) {
      if (this.cummingEmitted) return [];
      this.cummingEmitted = true;
      return this.cummingEvents(fromTime);
    }
    const events: ProgramEvent[] = [];
    let at = fromTime;
    if (this.pendingRecovery) {
      this.pendingRecovery = false;
      const rec = buildRecovery(
        ctx.currentRawSpeed,
        this.floor,
        this.variabilityPercent,
        at,
      );
      events.push(...rec.events);
      at = rec.endAt;
    }
    while (at < untilTime) {
      const cycle = buildFullCycle(this.floor, this.variabilityPercent, at);
      events.push(...cycle.events);
      at = cycle.endAt;
    }
    return events;
  }

  scale(event: SpeedEvent): number {
    if (event.unscaled === true) return event.speed;
    return scaleSpeed(event.speed, this.speedPercent);
  }

  // Groove's wind-down: unscaled ramp 30 -> ... -> 5, park at 0 far in the
  // future, plus a stroke-minus pulse from +3s to +12s (a 9s pulse). Sorted by
  // `at` because the valve pulse interleaves with the ramp.
  private cummingEvents(startAt: number): ProgramEvent[] {
    const events: ProgramEvent[] = [];
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
      at: at + 1_800_000,
      speed: 0,
      unscaled: true,
    });
    // Stroke-minus pulse: open at +3s, close at +12s (a 9s hold), as two events.
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
