// Autopilot as an AlgorithmEngine — a faithful port of the original
// fun.autoblow.com/vacuglide/autopilot client bundle (its pattern templates and
// constants). Pure event generation/scaling — no React, no device; generation
// helpers are private to this file.

import {
  type PlayerContext,
  type AlgorithmEngine,
  type SpeedEvent,
  type ValveEvent,
} from "@/lib/program";

export type IntensityLevel = "warmup" | "low" | "medium" | "high";
export type EdgeControlLevel = "gentle" | "moderate" | "intense";
export type SuctionControlLevel = "off" | "little" | "more";

interface TemplateStep {
  speed: number;
  duration: number;
}

const SPEED_MAX = 100;
const SPEED_TEMPLATE_MIN = 5;
const FINISH_HOLD_MS = 1_800_000;
const TEMPLATES_PER_BLOCK = 10;
const BLOCK_LEAD_IN_SPEED = 10;

const PATTERN_TEMPLATES: TemplateStep[][] = [
  [
    5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
    100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10,
    5,
  ].map((s) => ({ speed: s, duration: 5000 })),
  [
    5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5,
  ].map((s) => ({ speed: s, duration: 7000 })),
  [
    { speed: 50, duration: 10000 },
    { speed: 100, duration: 7000 },
    { speed: 10, duration: 10000 },
    { speed: 50, duration: 10000 },
    { speed: 100, duration: 7000 },
    { speed: 10, duration: 10000 },
    { speed: 50, duration: 10000 },
    { speed: 100, duration: 7000 },
    { speed: 10, duration: 10000 },
  ],
  [
    { speed: 10, duration: 10000 },
    { speed: 100, duration: 10000 },
    { speed: 10, duration: 10000 },
    { speed: 100, duration: 10000 },
    { speed: 10, duration: 10000 },
    { speed: 100, duration: 10000 },
    { speed: 10, duration: 10000 },
    { speed: 100, duration: 10000 },
  ],
  [
    { speed: 5, duration: 3000 },
    { speed: 50, duration: 10000 },
    { speed: 10, duration: 4000 },
    { speed: 60, duration: 10000 },
    { speed: 5, duration: 5000 },
    { speed: 70, duration: 10000 },
    { speed: 10, duration: 5000 },
    { speed: 80, duration: 10000 },
    { speed: 5, duration: 6000 },
    { speed: 90, duration: 10000 },
    { speed: 10, duration: 7000 },
    { speed: 100, duration: 10000 },
    { speed: 5, duration: 5000 },
  ],
  [
    { speed: 5, duration: 3000 },
    { speed: 10, duration: 3000 },
    { speed: 15, duration: 3000 },
    { speed: 20, duration: 3000 },
    { speed: 15, duration: 3000 },
    { speed: 10, duration: 3000 },
    { speed: 5, duration: 5000 },
    { speed: 10, duration: 5000 },
    { speed: 15, duration: 5000 },
    { speed: 20, duration: 5000 },
    { speed: 15, duration: 5000 },
    { speed: 10, duration: 5000 },
    { speed: 5, duration: 5000 },
  ],
  [
    { speed: 20, duration: 5000 },
    { speed: 40, duration: 10000 },
    { speed: 100, duration: 10000 },
    { speed: 30, duration: 9000 },
    { speed: 100, duration: 10000 },
    { speed: 20, duration: 8000 },
    { speed: 100, duration: 10000 },
    { speed: 10, duration: 7000 },
    { speed: 100, duration: 10000 },
    { speed: 5, duration: 6000 },
    { speed: 100, duration: 10000 },
    { speed: 5, duration: 5000 },
    { speed: 100, duration: 10000 },
    { speed: 5, duration: 4000 },
    { speed: 100, duration: 8000 },
    { speed: 5, duration: 3000 },
    { speed: 100, duration: 7000 },
    { speed: 5, duration: 2000 },
    { speed: 100, duration: 6000 },
  ],
  [
    { speed: 20, duration: 2000 },
    { speed: 90, duration: 5000 },
    { speed: 100, duration: 5000 },
    { speed: 90, duration: 5000 },
    { speed: 80, duration: 5000 },
  ],
];

const intensityRanges: Record<IntensityLevel, { min: number; max: number }> = {
  warmup: { min: 5, max: 20 },
  low: { min: 5, max: 30 },
  medium: { min: 15, max: 70 },
  high: { min: 30, max: 100 },
};

const edgeControlParams: Record<
  EdgeControlLevel,
  { plateauTime: number; cooldownTime: number }
> = {
  gentle: { plateauTime: 0.5, cooldownTime: 2 },
  moderate: { plateauTime: 1, cooldownTime: 1 },
  intense: { plateauTime: 1.5, cooldownTime: 0.5 },
};

const suctionControlParams: Record<
  SuctionControlLevel,
  {
    enabled: boolean;
    baseDuration: number;
    speedMultiplier: number;
    interval: number;
  }
> = {
  off: { enabled: false, baseDuration: 0, speedMultiplier: 0, interval: 0 },
  little: {
    enabled: true,
    baseDuration: 200,
    speedMultiplier: 0.8,
    interval: 3000,
  },
  more: {
    enabled: true,
    baseDuration: 400,
    speedMultiplier: 0.6,
    interval: 2000,
  },
};

function scaleSpeedToIntensity(speed: number, level: IntensityLevel): number {
  const { min, max } = intensityRanges[level];
  const norm = (speed - SPEED_TEMPLATE_MIN) / (SPEED_MAX - SPEED_TEMPLATE_MIN);
  const scaled = Math.round(min + norm * (max - min));
  return Math.max(min, Math.min(max, scaled));
}

function scaleDurationToEdge(
  templateSpeed: number,
  duration: number,
  edge: EdgeControlLevel,
): number {
  const p = edgeControlParams[edge];
  if (templateSpeed > 70) return Math.round(duration * p.plateauTime);
  if (templateSpeed < 30) return Math.round(duration * p.cooldownTime);
  return duration;
}

function applyPlateauJitter(speed: number, edge: EdgeControlLevel): number {
  if (edge === "intense" && speed > 70) {
    const headroom = Math.min(SPEED_MAX - speed, 15);
    return speed + Math.round(headroom * Math.random());
  }
  if (edge === "gentle" && speed > 70) {
    const excess = Math.min(speed - 50, 20);
    return speed - Math.round(excess * 0.5);
  }
  return speed;
}

function buildBlock(
  startAt: number,
  intensity: IntensityLevel,
  edge: EdgeControlLevel,
): { events: SpeedEvent[]; endAt: number } {
  const events: SpeedEvent[] = [
    { kind: "speed", at: startAt, speed: BLOCK_LEAD_IN_SPEED },
  ];
  let at = startAt;
  for (let i = 0; i < TEMPLATES_PER_BLOCK; i++) {
    const template =
      PATTERN_TEMPLATES[Math.floor(Math.random() * PATTERN_TEMPLATES.length)];
    if (template === undefined) continue;
    for (const step of template) {
      const scaled = scaleSpeedToIntensity(step.speed, intensity);
      const speed = applyPlateauJitter(scaled, edge);
      const duration = scaleDurationToEdge(step.speed, step.duration, edge);
      at += duration;
      events.push({ kind: "speed", at, speed });
    }
  }
  return { events, endAt: at };
}

function speedInEffectAt(
  events: SpeedEvent[],
  t: number,
  fallback: number,
): number {
  let speed = fallback;
  for (const ev of events) {
    if (ev.at > t) break;
    speed = ev.speed;
  }
  return speed;
}

export class AutopilotEngine implements AlgorithmEngine {
  private intensityLevel: IntensityLevel;
  private edgeControlLevel: EdgeControlLevel;
  private suctionControlLevel: SuctionControlLevel;
  private finishing = false;
  private finishEmitted = false;

  constructor(
    intensity: IntensityLevel,
    edgeControl: EdgeControlLevel,
    suctionControl: SuctionControlLevel,
  ) {
    this.intensityLevel = intensity;
    this.edgeControlLevel = edgeControl;
    this.suctionControlLevel = suctionControl;
  }

  reset(): void {
    this.finishing = false;
    this.finishEmitted = false;
  }

  setIntensity(level: IntensityLevel): void {
    this.intensityLevel = level;
  }

  setEdgeControl(level: EdgeControlLevel): void {
    this.edgeControlLevel = level;
  }

  setSuctionControl(level: SuctionControlLevel): void {
    this.suctionControlLevel = level;
  }

  beginFinish(): void {
    this.finishing = true;
    this.finishEmitted = false;
    this.intensityLevel = "high";
    this.edgeControlLevel = "moderate";
    this.suctionControlLevel = "off";
  }

  generateSpeed(
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): SpeedEvent[] {
    if (this.finishing) {
      if (this.finishEmitted) return [];
      this.finishEmitted = true;
      return [
        { kind: "speed", at: fromTime, speed: SPEED_MAX, unscaled: true },
        {
          kind: "speed",
          at: fromTime + FINISH_HOLD_MS,
          speed: 0,
          unscaled: true,
        },
      ];
    }

    const events: SpeedEvent[] = [];
    let at = fromTime;
    while (at < untilTime) {
      const block = buildBlock(at, this.intensityLevel, this.edgeControlLevel);
      events.push(...block.events);
      at = block.endAt;
    }
    return events;
  }

  // Vacuum maintenance: brief stroke-minus pulses on a fixed interval grid, each
  // pulse's length keyed to the speed in effect at that moment (slow strokes get
  // long pulses). Stateless — pulses sit on the global `k × interval` grid — so
  // the Player can re-lay this overlay (invalidateValves) when the setting
  // changes without re-rolling the speed script. Finish closes both valves.
  generateValves(
    speedEvents: SpeedEvent[],
    fromTime: number,
    untilTime: number,
    ctx: PlayerContext,
  ): ValveEvent[] {
    if (this.finishing) {
      return [
        { kind: "valve", at: fromTime, valve: "minus", open: false },
        { kind: "valve", at: fromTime, valve: "plus", open: false },
      ];
    }

    const p = suctionControlParams[this.suctionControlLevel];
    if (!p.enabled) return [];

    const valves: ValveEvent[] = [];
    for (
      let t = Math.ceil(fromTime / p.interval) * p.interval;
      t < untilTime;
      t += p.interval
    ) {
      const speedFactor =
        speedInEffectAt(speedEvents, t, ctx.currentRawSpeed) / SPEED_MAX;
      const pulseMs = Math.round(
        (p.baseDuration * p.speedMultiplier) / (speedFactor + 0.1),
      );
      valves.push({ kind: "valve", at: t, valve: "minus", open: true });
      valves.push({
        kind: "valve",
        at: t + pulseMs,
        valve: "minus",
        open: false,
      });
    }
    return valves;
  }

  scale(event: SpeedEvent): number {
    return event.speed;
  }
}
