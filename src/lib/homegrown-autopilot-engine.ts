// Homegrown Autopilot algorithm — a fresh, still-to-be-built alternative to the
// Vacuglide Autopilot. It drives the device purely through the getDevice
// accessor it is handed, so it reuses the same device layer
// (useVacuglideDevice) as everything else.
//
// Runs a fixed speed pattern (the speed VALUES never vary): start at 75, step
// down by 5 to 50, step back up by 5 to 100, then step back down by 5 to 75 —
// then repeat. Two knobs scale this uniformly before it's sent to the device:
//   - speedPercent (0-100): scales every raw speed.
//   - variability (off/medium/high -> 0/40/80%): randomises how long each step
//     takes, one random draw per ramp (the whole 75->50, or 50->100, or
//     100->75 leg) rather than per individual step, so a ramp stays a smooth
//     line at its own pace instead of jittering step to step.
// Changing variability regenerates the script, but seamlessly — it finishes
// the ramp currently in progress (from the current speed, continuing in the
// current direction) before the newly-randomised timing takes over.

import type { VacuglideDevice } from "@/lib/vacuglide-device";

interface ScriptWaypoint {
  speed: number;
  at: number;
}

export type VariabilityLevel = "off" | "low" | "medium" | "high";

const VARIABILITY_PERCENT: Record<VariabilityLevel, number> = {
  off: 0,
  low: 25,
  medium: 50,
  high: 80,
};

const TICK_MS = 100;
const STEP_MS = 5000;
const STEP_SIZE = 5;
const START_SPEED = 75;
const FLOOR_SPEED = 50;
const PEAK_SPEED = 100;

// The pattern's three ramps, in order. Only the last one returns to
// START_SPEED, which is what lets a seamless transition know when it's
// completed a full cycle (see buildTransitionScript).
const LEGS: ReadonlyArray<{ from: number; to: number }> = [
  { from: START_SPEED, to: FLOOR_SPEED },
  { from: FLOOR_SPEED, to: PEAK_SPEED },
  { from: PEAK_SPEED, to: START_SPEED },
];

// One ramp's waypoints, from just after `from` up to and including `to`,
// starting at time `startAt`. All its steps share a single random duration
// (skipped entirely, i.e. the standard 5s, when variabilityPercent is 0) so the
// randomness reads as "this ramp is quicker/slower", not step-to-step jitter.
function buildLeg(
  from: number,
  to: number,
  variabilityPercent: number,
  startAt: number,
): { waypoints: ScriptWaypoint[]; endAt: number } {
  const jitter = (Math.random() * 2 - 1) * (variabilityPercent / 100);
  const stepMs = Math.max(1, Math.round(STEP_MS * (1 + jitter)));
  const direction = to > from ? STEP_SIZE : -STEP_SIZE;
  const steps = Math.abs(to - from) / STEP_SIZE;
  const waypoints: ScriptWaypoint[] = [];
  let at = startAt;
  let speed = from;
  for (let i = 0; i < steps; i++) {
    speed += direction;
    at += stepMs;
    waypoints.push({ speed, at });
  }
  return { waypoints, endAt: at };
}

// A fresh full cycle (75 -> 50 -> 100 -> 75), `at` values relative to 0.
function buildFullScript(variabilityPercent: number): ScriptWaypoint[] {
  const script: ScriptWaypoint[] = [{ speed: START_SPEED, at: 0 }];
  let at = 0;
  for (const leg of LEGS) {
    const { waypoints, endAt } = buildLeg(leg.from, leg.to, variabilityPercent, at);
    script.push(...waypoints);
    at = endAt;
  }
  return script;
}

// A one-time seamless transition: finish the ramp currently under way (from
// `fromSpeed`, continuing toward that leg's existing target), play out
// whichever ramps remain to close this cycle back at START_SPEED, then append
// one full fresh cycle so there's always more script ahead once this plays
// out. `at` values are relative to 0 = "now".
function buildTransitionScript(
  fromSpeed: number,
  currentLeg: number,
  variabilityPercent: number,
): ScriptWaypoint[] {
  const script: ScriptWaypoint[] = [];
  let at = 0;
  const remainder = buildLeg(
    fromSpeed,
    LEGS[currentLeg]!.to,
    variabilityPercent,
    at,
  );
  script.push(...remainder.waypoints);
  at = remainder.endAt;
  for (const leg of LEGS.slice(currentLeg + 1)) {
    const seg = buildLeg(leg.from, leg.to, variabilityPercent, at);
    script.push(...seg.waypoints);
    at = seg.endAt;
  }
  for (const leg of LEGS) {
    const seg = buildLeg(leg.from, leg.to, variabilityPercent, at);
    script.push(...seg.waypoints);
    at = seg.endAt;
  }
  return script;
}

export interface HomegrownAutopilotOptions {
  getDevice: () => VacuglideDevice | null;
  speedPercent: number;
  variability: VariabilityLevel;
}

export class HomegrownAutopilot {
  private readonly getDevice: () => VacuglideDevice | null;

  isPlaying = false;
  currentSpeed = 0;

  private script: ScriptWaypoint[];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentTime = 0;
  private currentScriptIndex = 0;
  private lastSentSpeed = START_SPEED;
  // Which of the 3 LEGS we're currently progressing through (or about to
  // start, at a boundary) — the anchor a variability change resumes from.
  private currentLeg = 0;
  private listeners: Array<() => void> = [];
  // The script's speeds are "raw" — everything actually sent to the device is
  // this percentage of that raw value, so the Speed slider can tame or amplify
  // the whole pattern uniformly.
  private speedPercent: number;
  private variabilityLevel: VariabilityLevel;

  constructor(opts: HomegrownAutopilotOptions) {
    this.getDevice = opts.getDevice;
    this.speedPercent = opts.speedPercent;
    this.variabilityLevel = opts.variability;
    this.script = buildFullScript(this.variabilityPercent);
  }

  private get variabilityPercent(): number {
    return VARIABILITY_PERCENT[this.variabilityLevel];
  }

  private scaleSpeed(raw: number): number {
    return Math.round((raw * this.speedPercent) / 100);
  }

  // Update the scale. If currently playing, immediately resend the current
  // waypoint's speed at the new percentage so the device reacts live as the
  // slider moves.
  setSpeedPercent(percent: number): void {
    this.speedPercent = Math.max(0, Math.min(100, percent));
    if (!this.isPlaying) {
      this.notify();
      return;
    }
    const scaled = this.scaleSpeed(this.lastSentSpeed);
    this.currentSpeed = scaled;
    this.notify();
    void this.device()
      .targetSpeedSet(scaled)
      .catch(() => undefined);
  }

  // Update how variable the ramp timings are. While playing, seamlessly
  // finish the ramp in progress before the new randomness takes over — see
  // buildTransitionScript.
  setVariability(level: VariabilityLevel): void {
    this.variabilityLevel = level;
    if (!this.isPlaying) {
      this.notify();
      return;
    }
    this.script = buildTransitionScript(
      this.lastSentSpeed,
      this.currentLeg,
      this.variabilityPercent,
    );
    this.currentScriptIndex = 0;
    this.currentTime = 0;
    this.notify();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  getState(): { isPlaying: boolean; currentSpeed: number } {
    return { isPlaying: this.isPlaying, currentSpeed: this.currentSpeed };
  }

  private device(): VacuglideDevice {
    const device = this.getDevice();
    if (device === null) throw new Error("No device connected");
    return device;
  }

  async start(): Promise<void> {
    this.script = buildFullScript(this.variabilityPercent);
    this.currentScriptIndex = 0;
    this.currentTime = 0;
    this.currentLeg = 0;
    this.isPlaying = true;
    const waypoint = this.script[0];
    if (waypoint !== undefined) {
      const scaled = this.scaleSpeed(waypoint.speed);
      this.currentSpeed = scaled;
      this.lastSentSpeed = waypoint.speed;
      await this.device().targetSpeedSet(scaled);
    }
    this.scheduleNextTick();
    this.notify();
  }

  private scheduleNextTick(): void {
    if (!this.isPlaying) return;
    this.timer = setTimeout(() => {
      void (async () => {
        try {
          await this.timerLoop();
        } catch {
          // ignore a transient device error; keep ticking
        }
        this.notify();
        this.scheduleNextTick();
      })();
    }, TICK_MS);
  }

  private async timerLoop(): Promise<void> {
    if (!this.isPlaying) return;
    if (this.currentScriptIndex >= this.script.length) {
      // Completed the script (a full cycle, or a variability transition's
      // lead-in + trailing cycle) — always land on a fresh, freshly-randomised
      // cycle starting at START_SPEED.
      this.script = buildFullScript(this.variabilityPercent);
      this.currentScriptIndex = 0;
      this.currentTime = 0;
      this.currentLeg = 0;
    }
    const waypoint = this.script[this.currentScriptIndex];
    if (waypoint !== undefined && this.currentTime >= waypoint.at) {
      const scaled = this.scaleSpeed(waypoint.speed);
      this.currentSpeed = scaled;
      await this.device().targetSpeedSet(scaled);
      this.lastSentSpeed = waypoint.speed;
      this.currentScriptIndex++;
      if (waypoint.speed === LEGS[this.currentLeg]!.to) {
        this.currentLeg = (this.currentLeg + 1) % LEGS.length;
      }
    }
    this.currentTime += TICK_MS;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async pause(): Promise<void> {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.clearTimer();
    this.currentSpeed = 0;
    this.notify();
    await this.device().targetSpeedStop();
  }
}
