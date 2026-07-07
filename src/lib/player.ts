// The shared Player: owns the program-clock, the tick loop, device sends (with
// duplicate-send suppression), and the 2-minute lookahead. It plays a
// AlgorithmEngine; it knows nothing about any specific algorithm. Lives in
// src/lib (no React) and reaches the device through a getDevice accessor, like
// the engines it replaces.

import type { VacuglideDevice } from "@/lib/vacuglide-device";
import {
  JUMP_MS,
  LOOKAHEAD_MS,
  MAX_RATE,
  MIN_RATE,
  RATE_STEP,
  TICK_MS,
  type PlayerContext,
  type ProgramEvent,
  type AlgorithmEngine,
  type SpeedEvent,
} from "@/lib/program";

export interface PlayerOptions {
  getDevice: () => VacuglideDevice | null;
  onError?: (message: string) => void;
}

export interface UpcomingWindow {
  // Step points for the sparkline; t is ms from now (0..windowMs).
  speed: Array<{ t: number; speed: number }>;
  // Valve pulses coming up in the window (rendered later; ignored for now).
  valves: Array<{ t: number; valve: "plus" | "minus"; durationMs: number }>;
}

export class Player {
  isPlaying = false;
  currentSpeed = 0;
  source: AlgorithmEngine | null = null;

  private readonly getDevice: () => VacuglideDevice | null;
  private readonly onError?: (message: string) => void;

  protected clock = 0;
  protected rate = 1;
  protected events: ProgramEvent[] = [];
  protected cursor = 0; // index of the next unfired event
  private lastDeviceSpeed: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private valveTimers: Array<ReturnType<typeof setTimeout>> = [];
  private listeners: Array<() => void> = [];

  constructor(opts: PlayerOptions) {
    this.getDevice = opts.getDevice;
    this.onError = opts.onError;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  protected notify(): void {
    for (const fn of this.listeners) fn();
  }

  getState(): {
    isPlaying: boolean;
    currentSpeed: number;
    clock: number;
    rate: number;
  } {
    return {
      isPlaying: this.isPlaying,
      currentSpeed: this.currentSpeed,
      clock: this.clock,
      rate: this.rate,
    };
  }

  private device(): VacuglideDevice {
    const d = this.getDevice();
    if (d === null) throw new Error("No device connected");
    return d;
  }

  protected context(): PlayerContext {
    const cur = this.currentSpeedEvent();
    return {
      clock: this.clock,
      currentSpeed: this.currentSpeed,
      currentRawSpeed: cur?.speed ?? 0,
    };
  }

  // The speed event currently in effect (last speed event at/before the cursor).
  protected currentSpeedEvent(): SpeedEvent | null {
    for (let i = this.cursor - 1; i >= 0; i--) {
      const ev = this.events[i]!;
      if (ev.kind === "speed") return ev;
    }
    return null;
  }

  // Set the active source and reset the timeline for a fresh session.
  setSource(source: AlgorithmEngine | null): void {
    this.source = source;
    this.clock = 0;
    this.rate = 1;
    this.events = [];
    this.cursor = 0;
    this.lastDeviceSpeed = null;
    this.currentSpeed = 0;
    source?.reset();
  }

  play(): void {
    if (this.isPlaying || this.source === null) return;
    this.isPlaying = true;
    this.scheduleNextTick();
    this.notify();
  }

  private scheduleNextTick(): void {
    if (!this.isPlaying) return;
    this.timer = setTimeout(() => {
      void (async () => {
        try {
          await this.tick();
        } catch (err) {
          this.onError?.((err as Error).message);
        }
        this.notify();
        this.scheduleNextTick();
      })();
    }, TICK_MS);
  }

  // Keep LOOKAHEAD_MS of future built ahead of the clock. `from` never trails the
  // clock, so after invalidateFuture() (which drops the future) generation
  // resumes cleanly at "now".
  protected ensureLookahead(): void {
    if (this.source === null) return;
    const horizon = this.clock + LOOKAHEAD_MS;
    let guard = 0;
    while (true) {
      const last = this.events[this.events.length - 1];
      const from = Math.max(last?.at ?? this.clock, this.clock);
      if (from >= horizon) break;
      const batch = this.source.generate(from, horizon, this.context());
      if (batch.length === 0) break; // source parked
      this.events.push(...batch);
      if (++guard > 10_000) break; // runaway guard
    }
  }

  private async tick(): Promise<void> {
    if (!this.isPlaying || this.source === null) return;
    this.ensureLookahead();

    // Fire every event due at/before the clock. Speed events just advance the
    // cursor (the in-effect speed is derived); valve events pulse immediately.
    while (
      this.cursor < this.events.length &&
      this.events[this.cursor]!.at <= this.clock
    ) {
      const ev = this.events[this.cursor]!;
      if (ev.kind === "valve") this.pulseValve(ev.valve, ev.durationMs);
      this.cursor++;
    }

    // Re-scale the in-effect speed every tick and send only when it changes.
    // This suppresses duplicate sends AND keeps magnitude knobs live without
    // regeneration (scale() reads the source's current knobs each tick).
    const current = this.currentSpeedEvent();
    const output = current === null ? 0 : this.source.scale(current, this.context());
    this.currentSpeed = output;
    if (output !== this.lastDeviceSpeed) {
      await this.device().targetSpeedSet(output);
      this.lastDeviceSpeed = output;
    }

    this.clock += TICK_MS * this.rate;
  }

  private pulseValve(valve: "plus" | "minus", durationMs: number): void {
    const dev = this.getDevice();
    if (dev === null) return;
    const set = (state: boolean): Promise<unknown> =>
      valve === "plus"
        ? dev.valveStrokePlusSet(state)
        : dev.valveStrokeMinusSet(state);
    void set(true).catch(() => undefined);
    this.valveTimers.push(
      setTimeout(() => {
        void set(false).catch(() => undefined);
      }, durationMs),
    );
  }

  async pause(): Promise<void> {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const t of this.valveTimers) clearTimeout(t);
    this.valveTimers = [];
    this.currentSpeed = 0;
    this.lastDeviceSpeed = null;
    this.notify();
    const dev = this.getDevice();
    if (dev !== null) {
      await dev.targetSpeedStop();
      await dev.valveStrokePlusSet(false).catch(() => undefined);
      await dev.valveStrokeMinusSet(false).catch(() => undefined);
    }
  }

  // ---- Transport (generic; a panel chooses whether to surface each) ----

  forward(): void {
    this.seek(this.clock + JUMP_MS);
  }

  back(): void {
    this.seek(Math.max(0, this.clock - JUMP_MS));
  }

  private seek(to: number): void {
    this.clock = to;
    // Events are stamped in program-time, so a jump keeps them — just re-place
    // the cursor at the first event after the new clock, and top up the future.
    let idx = this.events.findIndex((e) => e.at > this.clock);
    if (idx === -1) idx = this.events.length;
    this.cursor = idx;
    this.ensureLookahead();
    this.notify();
  }

  faster(): void {
    this.setRate(this.rate * RATE_STEP);
  }

  slower(): void {
    this.setRate(this.rate / RATE_STEP);
  }

  private setRate(r: number): void {
    // Rate only changes how fast the clock consumes program-time — no
    // regeneration: events keep their program-time `at`.
    this.rate = Math.max(MIN_RATE, Math.min(MAX_RATE, r));
    this.notify();
  }

  // ---- Regeneration (the "push" a source triggers on a knob/finish/cumming) ----

  // Drop everything after the cursor (keep the past + the in-effect event) and
  // re-pull generate from now. The source reflects its new state on the re-pull.
  invalidateFuture(): void {
    if (this.source === null) return;
    this.events = this.events.slice(0, this.cursor);
    this.ensureLookahead();
    this.notify();
  }

  // ---- Sparkline source ----

  // The device output over the next windowMs. Flat at 0 while paused (matches
  // the engines' getUpcomingCurve today; the idle preview is a later change).
  upcomingWindow(windowMs: number): UpcomingWindow {
    if (!this.isPlaying || this.source === null) {
      return {
        speed: [
          { t: 0, speed: 0 },
          { t: windowMs, speed: 0 },
        ],
        valves: [],
      };
    }
    const source = this.source;
    const ctx = this.context();
    const outputAt = (ev: SpeedEvent): number => source.scale(ev, ctx);
    const now = this.clock;
    const end = now + windowMs;
    const current = this.currentSpeedEvent();
    let inEffect = current === null ? 0 : outputAt(current);
    const speed: Array<{ t: number; speed: number }> = [];
    const valves: UpcomingWindow["valves"] = [];
    for (let i = this.cursor; i < this.events.length; i++) {
      const ev = this.events[i]!;
      if (ev.at > end) break;
      if (ev.kind === "valve") {
        valves.push({
          t: Math.max(0, ev.at - now),
          valve: ev.valve,
          durationMs: ev.durationMs,
        });
        continue;
      }
      if (ev.at <= now) {
        inEffect = outputAt(ev);
        continue;
      }
      speed.push({ t: ev.at - now, speed: outputAt(ev) });
    }
    const curve = [{ t: 0, speed: inEffect }, ...speed];
    const last = curve[curve.length - 1]!;
    if (last.t < windowMs) curve.push({ t: windowMs, speed: last.speed });
    return { speed: curve, valves };
  }
}
