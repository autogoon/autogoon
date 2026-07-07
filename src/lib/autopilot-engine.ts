// Autopilot as an AlgorithmEngine — a faithful port of the algorithm in the
// original fun.autoblow.com/vacuglide/autopilot client bundle (its pattern
// templates and constants), translated onto the shared Player's event model. The
// Player owns the clock, lookahead, sends and valve timing; this only *generates*
// events and *scales* them. Generation helpers are private to this file —
// algorithms do not share generation code.

import {
  type PlayerContext,
  type ProgramEvent,
  type AlgorithmEngine,
  type SpeedEvent,
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
// finishMe parks 0 half an hour out, so a single near-instant blip to 0 happens
// every 30 minutes rather than needing extra state to suppress a wraparound.
const FINISH_HOLD_MS = 1_800_000;
// Number of random templates laid down per generated block.
const TEMPLATES_PER_BLOCK = 10;
// The speed a fresh block leads in with (a literal device value, NOT scaled).
const BLOCK_LEAD_IN_SPEED = 10;

// The original's eight pattern templates, verbatim. Speeds are template-space
// (5-100) and get rescaled to the intensity range; durations are ms and get
// warped by the edge-control setting.
const PATTERN_TEMPLATES: TemplateStep[][] = [
  // 1: slow staircase up to 100 and back down, 5s per step
  [
    5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
    100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10,
    5,
  ].map((s) => ({ speed: s, duration: 5000 })),
  // 2: gentler staircase up to 50 and back, 7s per step
  [
    5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5,
  ].map((s) => ({ speed: s, duration: 7000 })),
  // 3: medium / max / low oscillation
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
  // 4: square wave low/max
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
  // 5: rising peaks with low dips between
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
  // 6: gentle low waves
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
  // 7: repeated max plateaus with shrinking rest valleys
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
  // 8: quick ramp to a sustained high plateau
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

// The helpers below are deliberately module-level functions, not private methods
// of the class: they are pure, stateless transforms, kept file-private (never
// exported). Matching the sibling engines (see goon-engine.ts), keeping them as
// functions avoids handing stateless code a `this` it does not use.

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

// The per-send plateau jitter the old timerLoop applied once per waypoint right
// before sending. It MUST be baked into the SpeedEvent at generation: the Player
// re-scales every tick, so doing it in scale() would re-randomise it every 100ms.
// Applied to the already-intensity-scaled speed, so it only ever bites at "high"
// intensity plateaus (the only range whose max exceeds 70).
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

// One block of TEMPLATES_PER_BLOCK random templates, laid down as SpeedEvents
// starting at `startAt`. Mirrors the original buildMysteryScript: a literal
// lead-in speed, then each template step's intensity-scaled (and plateau-
// jittered) speed placed at the END of its edge-warped duration. Returns the
// events plus the time the block ends (a clean boundary for the next block).
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

// The device speed in effect at time `t` given the batch's speed events (sorted
// ascending). Used to size a suction pulse from the speed it fires under.
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

export interface AutopilotOptions {
  intensity: IntensityLevel;
  edgeControl: EdgeControlLevel;
  suctionControl: SuctionControlLevel;
}

export class Autopilot implements AlgorithmEngine {
  private intensityLevel: IntensityLevel;
  private edgeControlLevel: EdgeControlLevel;
  private suctionControlLevel: SuctionControlLevel;
  // Program-time of the last suction pulse placed; carried across generate calls
  // so the pulse cadence is continuous. Reset by reset() (a fresh session).
  private lastSuctionTime = 0;
  private finishing = false;
  private finishEmitted = false;

  constructor(opts: AutopilotOptions) {
    this.intensityLevel = opts.intensity;
    this.edgeControlLevel = opts.edgeControl;
    this.suctionControlLevel = opts.suctionControl;
  }

  reset(): void {
    this.finishing = false;
    this.finishEmitted = false;
    this.lastSuctionTime = 0;
  }

  // Shape knob: changes the SPEED pattern. The hook calls invalidateFuture()
  // after this while playing so generate() re-lays blocks at the new intensity.
  setIntensity(level: IntensityLevel): void {
    this.intensityLevel = level;
  }

  // Shape knob: changes speed plateau/cooldown warping (and plateau jitter).
  // The hook invalidates after this while playing.
  setEdgeControl(level: EdgeControlLevel): void {
    this.edgeControlLevel = level;
  }

  // Suction knob: changes ONLY the suction pulses. The hook does NOT invalidate,
  // so already-scheduled pulses (up to the lookahead) keep their old cadence and
  // the new level only takes effect as the lookahead extends. lastSuctionTime is
  // left untouched so the cadence stays phase-continuous.
  setSuctionControl(level: SuctionControlLevel): void {
    this.suctionControlLevel = level;
  }

  // Finish: a crescendo, not a halt. generate() jumps to full speed now and
  // parks 0 half an hour out; intensity/edge/suction are forced to their finish
  // values (full intensity, edge "moderate" — the one level whose warp
  // multipliers are both 1 — and vacuum off). The hook invalidates after this.
  beginFinish(): void {
    this.finishing = true;
    this.finishEmitted = false;
    this.intensityLevel = "high";
    this.edgeControlLevel = "moderate";
    this.suctionControlLevel = "off";
  }

  generate(
    fromTime: number,
    untilTime: number,
    ctx: PlayerContext,
  ): ProgramEvent[] {
    if (this.finishing) {
      if (this.finishEmitted) return [];
      this.finishEmitted = true;
      // Jump to full speed now, park 0 far out, and close both stroke valves so
      // any suction pulse caught mid-open (its close event just dropped by the
      // invalidate) does not stay stuck open — mirrors the old finishMe.
      return [
        { kind: "speed", at: fromTime, speed: SPEED_MAX, unscaled: true },
        { kind: "valve", at: fromTime, valve: "minus", open: false },
        { kind: "valve", at: fromTime, valve: "plus", open: false },
        {
          kind: "speed",
          at: fromTime + FINISH_HOLD_MS,
          speed: 0,
          unscaled: true,
        },
      ];
    }

    // Lay down whole blocks until the lookahead horizon is covered. Each block is
    // long (many minutes), so this is usually a single block per call.
    const speedEvents: SpeedEvent[] = [];
    let at = fromTime;
    while (at < untilTime) {
      const block = buildBlock(at, this.intensityLevel, this.edgeControlLevel);
      speedEvents.push(...block.events);
      at = block.endAt;
    }
    const batchEnd = at;

    const events: ProgramEvent[] = [...speedEvents];

    // Suction ("Vacuum Maintenance"): a pulse every `interval` of program-time,
    // each an open/close ValveEvent pair on the minus valve. Placed across the
    // full speed extent [fromTime, batchEnd) so suction coverage tracks speed
    // coverage exactly.
    const p = suctionControlParams[this.suctionControlLevel];
    if (p.enabled) {
      // After a re-pull (invalidateFuture drops the future), lastSuctionTime can
      // sit a whole block ahead of the new frontier — it tracked pulses that were
      // just discarded. Clamp it back so suction resumes at `fromTime` instead of
      // going silent until the old frontier. On a normal extension lastSuctionTime
      // is always < fromTime, so this is a no-op there.
      if (this.lastSuctionTime >= fromTime) {
        this.lastSuctionTime = fromTime - p.interval;
      }
      // Advance the cadence up to the generation frontier without emitting pulses
      // that would land before `fromTime` (they are already in the past for the
      // Player, and would break the sorted-events contract). This matters when
      // suction was off for a while and is re-enabled.
      while (this.lastSuctionTime + p.interval < fromTime) {
        this.lastSuctionTime += p.interval;
      }
      let t = this.lastSuctionTime + p.interval;
      while (t < batchEnd) {
        const speedFactor = speedInEffectAt(speedEvents, t, ctx.currentRawSpeed) / SPEED_MAX;
        const pulseMs = Math.round(
          (p.baseDuration * p.speedMultiplier) / (speedFactor + 0.1),
        );
        events.push({ kind: "valve", at: t, valve: "minus", open: true });
        events.push({ kind: "valve", at: t + pulseMs, valve: "minus", open: false });
        this.lastSuctionTime = t;
        t += p.interval;
      }
    }

    events.sort((a, b) => a.at - b.at);
    return events;
  }

  // Speeds are fully baked at generation (intensity scaling, edge duration-warp
  // and the per-send plateau jitter), so scale() is identity — honouring the
  // `unscaled` finish events the same way.
  scale(event: SpeedEvent): number {
    return event.speed;
  }
}
