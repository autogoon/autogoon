// CompanionEngine — the motion backbone for the Companions algorithm. A faithful,
// self-contained port of AutopilotEngine's generation (pattern templates,
// constants, block builder, intensity/edge scaling, suction valves, finish),
// duplicated rather than imported because engines don't import each other (see
// ARCHITECTURE.md; Goon duplicates Groove for the same reason). The one addition
// over Autopilot is that each template carries a `label` — a neutral, present-
// tense description of what that mini-program does — which the narration overlay
// reads (see generateNarrationCues). Pure event generation/scaling: no React, no
// device, no LLM, no personas (those ride on top in Slice 4).

import {
  type PlayerContext,
  type AlgorithmEngine,
  type SpeedEvent,
  type ValveEvent,
} from "@/lib/program";

export type IntensityLevel = "warmup" | "low" | "medium" | "high";
export type EdgeControlLevel = "gentle" | "moderate" | "intense";
export type SuctionControlLevel = "off" | "little" | "more";

// A narration cue: the program switches to a new mini-program at `at`, described
// by `text` (a neutral, persona-agnostic label). The persona voices it in Slice
// 4; here it is plain data. Not part of the AlgorithmEngine contract — the Player
// doesn't consume cues until Slice 4.
export interface NarrationCue {
  at: number;
  text: string;
}

interface TemplateStep {
  speed: number;
  duration: number;
}

// A pattern template plus its narration label. The label is neutral and
// persona-agnostic — the persona voices it in Slice 4; here it is plain data.
interface LabelledTemplate {
  steps: TemplateStep[];
  label: string;
}

const SPEED_MAX = 100;
const SPEED_TEMPLATE_MIN = 5;
const FINISH_HOLD_MS = 1_800_000;
const TEMPLATES_PER_BLOCK = 10;
const BLOCK_LEAD_IN_SPEED = 10;
const FINISH_CUE_LABEL = "the finish — full and relentless";

const LABELLED_TEMPLATES: LabelledTemplate[] = [
  {
    steps: [
      5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
      100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15,
      10, 5,
    ].map((s) => ({ speed: s, duration: 5000 })),
    label: "a long, slow sweep all the way up and back down",
  },
  {
    steps: [
      5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5,
    ].map((s) => ({ speed: s, duration: 7000 })),
    label: "a gentle, shallow build and ebb",
  },
  {
    steps: [
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
    label: "surging between a crawl and full pace",
  },
  {
    steps: [
      { speed: 10, duration: 10000 },
      { speed: 100, duration: 10000 },
      { speed: 10, duration: 10000 },
      { speed: 100, duration: 10000 },
      { speed: 10, duration: 10000 },
      { speed: 100, duration: 10000 },
      { speed: 10, duration: 10000 },
      { speed: 100, duration: 10000 },
    ],
    label: "slamming between dead slow and full tilt",
  },
  {
    steps: [
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
    label: "teasing climbs, each one higher than the last",
  },
  {
    steps: [
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
    label: "tiny teasing waves down low",
  },
  {
    steps: [
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
    label: "full-pace bursts with deeper and deeper plunges between",
  },
  {
    steps: [
      { speed: 20, duration: 2000 },
      { speed: 90, duration: 5000 },
      { speed: 100, duration: 5000 },
      { speed: 90, duration: 5000 },
      { speed: 80, duration: 5000 },
    ],
    label: "a quick rise into a hold near the top",
  },
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

// One block: TEMPLATES_PER_BLOCK randomly-chosen templates concatenated behind a
// lead-in event, each step scaled by intensity/edge. Returns the events, the
// narration segments (one per template, at the boundary where that template
// begins — always coincident with a real speed-event time), and the time the
// block ends so successive blocks chain back to back.
function buildBlock(
  startAt: number,
  intensity: IntensityLevel,
  edge: EdgeControlLevel,
): { events: SpeedEvent[]; segments: NarrationCue[]; endAt: number } {
  const events: SpeedEvent[] = [
    { kind: "speed", at: startAt, speed: BLOCK_LEAD_IN_SPEED },
  ];
  const segments: NarrationCue[] = [];
  let at = startAt;
  for (let i = 0; i < TEMPLATES_PER_BLOCK; i++) {
    const template =
      LABELLED_TEMPLATES[Math.floor(Math.random() * LABELLED_TEMPLATES.length)];
    if (template === undefined) continue;
    // The boundary is the current cursor — the moment before this template's
    // first step, coincident with the previous event's time (or the lead-in).
    segments.push({ at, text: template.label });
    for (const step of template.steps) {
      const scaled = scaleSpeedToIntensity(step.speed, intensity);
      const speed = applyPlateauJitter(scaled, edge);
      const duration = scaleDurationToEdge(step.speed, step.duration, edge);
      at += duration;
      events.push({ kind: "speed", at, speed });
    }
  }
  return { events, segments, endAt: at };
}

export class CompanionEngine implements AlgorithmEngine {
  private intensityLevel: IntensityLevel;
  private edgeControlLevel: EdgeControlLevel;
  private suctionControlLevel: SuctionControlLevel;
  private finishing = false;
  private finishEmitted = false;
  // Narration segments recorded as speed is generated — one per template
  // boundary. generateNarrationCues reads these; reset() clears them.
  private narrationSegments: NarrationCue[] = [];

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
    this.narrationSegments = [];
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
      this.narrationSegments.push(...block.segments);
      at = block.endAt;
    }
    return events;
  }

  // Vacuum maintenance, faithful to Autopilot's handleSuctionControl: a
  // stroke-minus pulse fires only when a speed move is sent (a step transition —
  // never mid-step), and only if at least `interval` has passed since the last
  // pulse. The interval is a minimum gap between pulses, not a cadence. Each
  // pulse's length is keyed to that move's speed (slow strokes get long pulses).
  // Finish closes both valves.
  generateValves(
    speedEvents: SpeedEvent[],
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): ValveEvent[] {
    if (this.finishing) {
      return [
        { kind: "valve", at: fromTime, valve: "minus", open: false },
        { kind: "valve", at: fromTime, valve: "plus", open: false },
      ];
    }

    const p = suctionControlParams[this.suctionControlLevel];
    if (!p.enabled) return [];

    // The gate starts closed at session start (lastSuctionTime starts at 0, so
    // nothing fires before `interval`) but OPEN on a mid-session (re-)lay, so the
    // very next move pulses.
    let lastPulse = fromTime === 0 ? 0 : Number.NEGATIVE_INFINITY;
    const valves: ValveEvent[] = [];
    for (const ev of speedEvents) {
      if (ev.at < fromTime || ev.at >= untilTime) continue;
      if (ev.at - lastPulse < p.interval) continue;
      const pulseMs = Math.round(
        (p.baseDuration * p.speedMultiplier) / (ev.speed / SPEED_MAX + 0.1),
      );
      valves.push({ kind: "valve", at: ev.at, valve: "minus", open: true });
      valves.push({
        kind: "valve",
        at: ev.at + pulseMs,
        valve: "minus",
        open: false,
      });
      lastPulse = ev.at;
    }
    return valves;
  }

  // Narration overlay: one cue per template boundary in [fromTime, untilTime),
  // read from the segments recorded as speed was generated (template choice is
  // random inside generation, so cues can't be re-derived from speed events).
  // While finishing, a single finish cue. CompanionEngine-only — not on the
  // AlgorithmEngine contract; the Player consumes cues in Slice 4.
  generateNarrationCues(fromTime: number, untilTime: number): NarrationCue[] {
    if (this.finishing) {
      return [{ at: fromTime, text: FINISH_CUE_LABEL }];
    }
    return this.narrationSegments
      .filter((s) => s.at >= fromTime && s.at < untilTime)
      .map((s) => ({ at: s.at, text: s.text }));
  }

  scale(event: SpeedEvent): number {
    return event.speed;
  }
}
