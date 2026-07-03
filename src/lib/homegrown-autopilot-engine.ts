// Homegrown Autopilot algorithm — a fresh, still-to-be-built alternative to the
// Vacuglide Autopilot. It drives the device purely through the getDevice
// accessor it is handed, so it reuses the same device layer
// (useVacuglideDevice) as everything else.
//
// Runs a fixed speed pattern (no randomness, no intensity/edge/vacuum knobs
// yet): start at 75, step down by 5 every 5s to 50, step back up by 5 every 5s
// to 100, then step back down by 5 every 5s to 75 — then repeat. Everything
// sent to the device is scaled by speedPercent, a 0-100 knob the UI exposes as
// the Speed slider.

import type { VacuglideDevice } from "@/lib/vacuglide-device";

interface ScriptWaypoint {
  speed: number;
  at: number;
}

const TICK_MS = 100;
const STEP_MS = 5000;
const STEP_SIZE = 5;
const START_SPEED = 75;
const FLOOR_SPEED = 50;
const PEAK_SPEED = 100;

function buildScript(): ScriptWaypoint[] {
  const script: ScriptWaypoint[] = [{ speed: START_SPEED, at: 0 }];
  let at = 0;
  let speed = START_SPEED;
  while (speed > FLOOR_SPEED) {
    speed -= STEP_SIZE;
    at += STEP_MS;
    script.push({ speed, at });
  }
  while (speed < PEAK_SPEED) {
    speed += STEP_SIZE;
    at += STEP_MS;
    script.push({ speed, at });
  }
  while (speed > START_SPEED) {
    speed -= STEP_SIZE;
    at += STEP_MS;
    script.push({ speed, at });
  }
  return script;
}

export interface HomegrownAutopilotOptions {
  getDevice: () => VacuglideDevice | null;
  speedPercent: number;
}

export class HomegrownAutopilot {
  private readonly getDevice: () => VacuglideDevice | null;
  private readonly script = buildScript();

  isPlaying = false;
  currentSpeed = 0;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentTime = 0;
  private currentScriptIndex = 0;
  private lastSentIndex = 0;
  private listeners: Array<() => void> = [];
  // The script's speeds are "raw" — everything actually sent to the device is
  // this percentage of that raw value, so the Speed slider can tame or amplify
  // the whole pattern uniformly.
  private speedPercent: number;

  constructor(opts: HomegrownAutopilotOptions) {
    this.getDevice = opts.getDevice;
    this.speedPercent = opts.speedPercent;
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
    const raw = this.script[this.lastSentIndex]?.speed ?? 0;
    const scaled = this.scaleSpeed(raw);
    this.currentSpeed = scaled;
    this.notify();
    void this.device()
      .targetSpeedSet(scaled)
      .catch(() => undefined);
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
    this.currentScriptIndex = 0;
    this.currentTime = 0;
    this.lastSentIndex = 0;
    this.isPlaying = true;
    const waypoint = this.script[this.lastSentIndex];
    if (waypoint !== undefined) {
      const scaled = this.scaleSpeed(waypoint.speed);
      this.currentSpeed = scaled;
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
      this.currentScriptIndex = 0;
      this.currentTime = 0;
    }
    const waypoint = this.script[this.currentScriptIndex];
    if (waypoint !== undefined && this.currentTime >= waypoint.at) {
      const scaled = this.scaleSpeed(waypoint.speed);
      this.currentSpeed = scaled;
      await this.device().targetSpeedSet(scaled);
      this.lastSentIndex = this.currentScriptIndex;
      this.currentScriptIndex++;
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
