// Groove as an AlgorithmEngine — the manual dip pattern (100 -> floor -> 100)
// with Speed + Variability knobs. Pure event generation/scaling — no React, no
// device; generation helpers are private to this file.

import {
  type PlayerContext,
  type AlgorithmEngine,
  type SpeedEvent,
  type ValveEvent,
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

interface Ramp {
  waypoints: Array<{ speed: number; at: number }>;
  endAt: number;
}

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

function scaleSpeed(raw: number, speedPercent: number): number {
  if (speedPercent <= 0) return 0;
  const exponent = 1 + LOW_END_GAMMA * (1 - speedPercent / 100);
  return Math.round(speedPercent * Math.pow(raw / PEAK_SPEED, exponent));
}

export class GrooveEngine implements AlgorithmEngine {
  private speedPercent: number;
  private variabilityLevel: VariabilityLevel;
  private pendingRecovery = false;
  private cumming = false;
  private cummingEmitted = false;

  constructor(speedPercent: number, variability: VariabilityLevel) {
    this.speedPercent = speedPercent;
    this.variabilityLevel = variability;
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

  setSpeedPercent(percent: number): void {
    this.speedPercent = Math.max(0, Math.min(100, percent));
  }

  setVariability(level: VariabilityLevel): void {
    this.variabilityLevel = level;
    this.pendingRecovery = true;
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
        { kind: "valve", at: fromTime + 3000, valve: "minus", open: true },
        { kind: "valve", at: fromTime + 12000, valve: "minus", open: false },
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
    return events;
  }
}
