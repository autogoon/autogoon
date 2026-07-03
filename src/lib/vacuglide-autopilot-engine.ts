// Vacuglide Autopilot engine — a faithful port of the algorithm in the original
// fun.autoblow.com/vacuglide/autopilot client bundle, including its pattern
// templates and constants. See README.md for a full description.

import type { VacuglideDevice } from "@/lib/vacuglide";

export type IntensityLevel = "warmup" | "low" | "medium" | "high";
export type EdgeControlLevel = "gentle" | "moderate" | "intense";
export type SuctionControlLevel = "off" | "little" | "more";

export type LogKind = "send" | "error" | "info";

interface TemplateStep {
  speed: number;
  duration: number;
}

interface ScriptWaypoint {
  speed: number;
  at: number;
}

const SPEED_MAX = 100;
const SPEED_TEMPLATE_MIN = 5;
const TICK_MS = 100;

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

export interface VacuglideAutopilotOptions {
  getDevice: () => VacuglideDevice | null;
  log: (text: string, kind?: LogKind) => void;
  intensity: IntensityLevel;
  edgeControl: EdgeControlLevel;
  suctionControl: SuctionControlLevel;
}

export class VacuglideAutopilot {
  private readonly getDevice: () => VacuglideDevice | null;
  private readonly log: (text: string, kind?: LogKind) => void;

  isPlaying = false;
  intensityLevel: IntensityLevel;
  edgeControlLevel: EdgeControlLevel;
  suctionControlLevel: SuctionControlLevel;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentTime = 0;
  private currentScriptIndex = 0;
  private lastSentIndex = 0;
  private mysteryScript: ScriptWaypoint[] = [];
  private listeners: Array<() => void> = [];
  private lastSuctionTime = 0;
  private suctionTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly intensityRanges: Record<
    IntensityLevel,
    { min: number; max: number }
  > = {
    warmup: { min: 5, max: 20 },
    low: { min: 5, max: 30 },
    medium: { min: 15, max: 70 },
    high: { min: 30, max: 100 },
  };

  private readonly edgeControlParams: Record<
    EdgeControlLevel,
    { plateauTime: number; cooldownTime: number }
  > = {
    gentle: { plateauTime: 0.5, cooldownTime: 2 },
    moderate: { plateauTime: 1, cooldownTime: 1 },
    intense: { plateauTime: 1.5, cooldownTime: 0.5 },
  };

  private readonly suctionControlParams: Record<
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

  constructor(opts: VacuglideAutopilotOptions) {
    this.getDevice = opts.getDevice;
    this.log = opts.log;
    this.intensityLevel = opts.intensity;
    this.edgeControlLevel = opts.edgeControl;
    this.suctionControlLevel = opts.suctionControl;
  }

  private device(): VacuglideDevice {
    const d = this.getDevice();
    if (d === null) throw new Error("No device connected");
    return d;
  }

  private generateMysteryScript(): void {
    this.mysteryScript = [{ speed: 10, at: 0 }];
    let at = 0;
    for (let i = 0; i < 10; i++) {
      const template =
        PATTERN_TEMPLATES[Math.floor(Math.random() * PATTERN_TEMPLATES.length)];
      if (template === undefined) continue;
      for (const step of template) {
        const speed = this.scaleSpeedToIntensity(step.speed);
        const duration = this.scaleDurationToEdge(step.speed, step.duration);
        at += duration;
        this.mysteryScript.push({ speed, at });
      }
    }
  }

  private scaleSpeedToIntensity(speed: number): number {
    const { min, max } = this.intensityRanges[this.intensityLevel];
    const norm =
      (speed - SPEED_TEMPLATE_MIN) / (SPEED_MAX - SPEED_TEMPLATE_MIN);
    const scaled = Math.round(min + norm * (max - min));
    return Math.max(min, Math.min(max, scaled));
  }

  private scaleDurationToEdge(templateSpeed: number, duration: number): number {
    const p = this.edgeControlParams[this.edgeControlLevel];
    if (templateSpeed > 70) return Math.round(duration * p.plateauTime);
    if (templateSpeed < 30) return Math.round(duration * p.cooldownTime);
    return duration;
  }

  private resetScript(): void {
    this.currentScriptIndex = 0;
    this.currentTime = 0;
    this.lastSentIndex = 0;
    this.generateMysteryScript();
  }

  setIntensity(level: IntensityLevel): void {
    this.intensityLevel = level;
    this.resetScript();
    this.notifyListeners();
  }

  setEdgeControl(level: EdgeControlLevel): void {
    this.edgeControlLevel = level;
    this.resetScript();
    this.notifyListeners();
  }

  setSuctionControl(level: SuctionControlLevel): void {
    this.suctionControlLevel = level;
    this.lastSuctionTime = 0;
    if (this.suctionTimer !== null) {
      clearTimeout(this.suctionTimer);
      this.suctionTimer = null;
    }
    this.notifyListeners();
  }

  async start(): Promise<void> {
    if (this.mysteryScript.length === 0) this.generateMysteryScript();
    this.isPlaying = true;
    const waypoint = this.mysteryScript[this.lastSentIndex];
    if (waypoint !== undefined) {
      await this.device().targetSpeedSet(waypoint.speed);
      this.log(`speed → ${waypoint.speed}`, "send");
    }
    this.scheduleNextTick();
    this.notifyListeners();
  }

  private scheduleNextTick(): void {
    if (!this.isPlaying) return;
    this.timer = setTimeout(() => {
      void (async () => {
        try {
          await this.timerLoop();
        } catch (err) {
          this.log(`error: ${(err as Error).message}`, "error");
        }
        this.notifyListeners();
        this.scheduleNextTick();
      })();
    }, TICK_MS);
  }

  private async timerLoop(): Promise<void> {
    if (!this.isPlaying) return;
    if (this.currentScriptIndex >= this.mysteryScript.length) {
      this.currentScriptIndex = 0;
      this.currentTime = 0;
      this.log("script ended, looping", "info");
    }
    const waypoint = this.mysteryScript[this.currentScriptIndex];
    if (waypoint !== undefined && this.currentTime >= waypoint.at) {
      let speed = waypoint.speed;
      // per-send jitter on plateaus
      if (this.edgeControlLevel === "intense" && speed > 70) {
        const headroom = Math.min(SPEED_MAX - speed, 15);
        speed += Math.round(headroom * Math.random());
      } else if (this.edgeControlLevel === "gentle" && speed > 70) {
        const excess = Math.min(speed - 50, 20);
        speed -= Math.round(excess * 0.5);
      }
      await this.device().targetSpeedSet(speed);
      this.log(`speed → ${speed}`, "send");
      this.lastSentIndex = this.currentScriptIndex;
      this.currentScriptIndex++;
      void this.handleSuctionControl(speed);
    }
    this.currentTime += TICK_MS;
  }

  private async handleSuctionControl(speed: number): Promise<void> {
    const p = this.suctionControlParams[this.suctionControlLevel];
    if (!p.enabled) return;
    if (this.currentTime - this.lastSuctionTime < p.interval) return;
    const speedFactor = speed / SPEED_MAX;
    const pulseMs = Math.round(
      (p.baseDuration * p.speedMultiplier) / (speedFactor + 0.1),
    );
    const dev = this.device();
    await dev.valveStrokeMinusSet(true);
    this.log(`suction pulse ${pulseMs}ms`, "send");
    this.suctionTimer = setTimeout(() => {
      dev.valveStrokeMinusSet(false).catch((err: Error) => {
        this.log(`failed to close suction valve: ${err.message}`, "error");
      });
    }, pulseMs);
    this.lastSuctionTime = this.currentTime;
  }

  private clearTimers(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.suctionTimer !== null) {
      clearTimeout(this.suctionTimer);
      this.suctionTimer = null;
    }
  }

  async pause(): Promise<void> {
    this.isPlaying = false;
    this.clearTimers();
    await this.device().targetSpeedStop();
    this.log("speed stop", "send");
    this.notifyListeners();
  }

  async stop(): Promise<void> {
    await this.pause();
    this.currentScriptIndex = 0;
    this.currentTime = 0;
    this.lastSentIndex = 0;
    this.lastSuctionTime = 0;
    this.notifyListeners();
  }

  async finishMe(): Promise<void> {
    this.isPlaying = false;
    this.clearTimers();
    const dev = this.device();
    await dev.valveStrokePlusSet(false);
    await dev.valveStrokeMinusSet(false);
    await dev.targetSpeedSet(SPEED_MAX);
    this.log(`finish me: valves closed, speed → ${SPEED_MAX}`, "send");
    this.notifyListeners();
  }

  getState(): { isPlaying: boolean; currentSpeed: number } {
    const current = this.mysteryScript[this.lastSentIndex];
    return {
      isPlaying: this.isPlaying,
      currentSpeed: this.isPlaying && current !== undefined ? current.speed : 0,
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => fn());
  }
}
