// Homegrown algorithm — a fresh, still-to-be-built alternative to the Vacuglide
// Autopilot. It drives the device purely through the getDevice accessor it is
// handed, so it reuses the same device layer (useVacuglide) as everything else.
// For now the "algorithm" just holds a constant speed of 10; the start/pause/
// subscribe scaffolding is here so it can grow.

import type { VacuglideDevice } from "@/lib/vacuglide";
import type { LogKind } from "@/hooks/use-vacuglide";

export interface HomegrownOptions {
  getDevice: () => VacuglideDevice | null;
  log: (text: string, kind?: LogKind) => void;
}

export class Homegrown {
  private readonly getDevice: () => VacuglideDevice | null;
  private readonly log: (text: string, kind?: LogKind) => void;

  isPlaying = false;
  currentSpeed = 0;

  private listeners: Array<() => void> = [];

  constructor(opts: HomegrownOptions) {
    this.getDevice = opts.getDevice;
    this.log = opts.log;
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
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentSpeed = 10;
    this.notify();
    this.log("speed → 10", "send");
    await this.device().targetSpeedSet(10);
  }

  async pause(): Promise<void> {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.currentSpeed = 0;
    this.notify();
    await this.device().targetSpeedStop();
  }
}
