// The shared Player: owns the program-clock, the tick loop, device sends (with
// duplicate-send suppression), and the 5-minute lookahead. It plays a
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
  type PlayerState,
  type ProgramEvent,
  type AlgorithmEngine,
  type SpeedEvent,
  type UpcomingWindow,
  type ValveEvent,
} from "@/lib/program";

export type { UpcomingWindow };

export interface PlayerOptions {
  getDevice: () => VacuglideDevice | null;
  onError?: (message: string) => void;
}

export class Player {
  state: PlayerState = "armed";
  get isPlaying(): boolean {
    return this.state === "playing";
  }
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
    state: PlayerState;
    isPlaying: boolean;
    currentSpeed: number;
    clock: number;
    rate: number;
  } {
    return {
      state: this.state,
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

  // Build the preview lookahead for a source WITHOUT starting the tick loop.
  // This is "the Player minus the tick loop and device sends": upcomingWindow()
  // and seek() work off it, so a panel can preview/scrub before Start.
  arm(source: AlgorithmEngine | null): void {
    this.setSource(source);
    this.ensureLookahead();
    this.state = "armed";
    this.notify();
  }

  // Re-arm the current source from scratch (fresh program at position 0). The
  // hook layer also restores its knobs to defaults; this handles the program.
  reset(): void {
    this.arm(this.source);
  }

  play(): void {
    if (this.state === "playing" || this.source === null) return;
    this.state = "playing";
    this.scheduleNextTick();
    this.notify();
  }

  // Re-emit to subscribers without touching the program — for scale-live knob
  // changes (e.g. intensity) that alter the preview's magnitude but not its
  // events, so the mirrored upcomingWindow recomputes while armed/paused.
  refresh(): void {
    this.notify();
  }

  private scheduleNextTick(): void {
    if (this.state !== "playing") return;
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

  // Keep LOOKAHEAD_MS of future built ahead of the clock. Speed is the backbone
  // (from never trails the last speed event, so after invalidateFuture() drops
  // the future, generation resumes cleanly at "now"); valves are overlaid across
  // each speed batch. Events land unsorted (a valve close can spill past the next
  // speed event), so the whole array is re-sorted once when anything was added.
  protected ensureLookahead(): void {
    if (this.source === null) return;
    const horizon = this.clock + LOOKAHEAD_MS;
    let guard = 0;
    let changed = false;
    while (true) {
      const from = Math.max(this.lastSpeedAt() ?? this.clock, this.clock);
      if (from >= horizon) break;
      const ctx = this.context();
      const speedBatch = this.source.generateSpeed(from, horizon, ctx);
      if (speedBatch.length === 0) break; // source parked
      const batchEnd = speedBatch[speedBatch.length - 1]!.at;
      const valveBatch = this.source.generateValves(
        speedBatch,
        from,
        batchEnd,
        ctx,
      );
      this.events.push(...speedBatch, ...valveBatch);
      changed = true;
      if (++guard > 10_000) break; // runaway guard
    }
    if (changed) this.events.sort((a, b) => a.at - b.at);
  }

  // The `at` of the last speed event (the speed backbone's extent), or null if
  // none. Valve closes can trail it, so this scans for the last speed rather than
  // reading the final array element.
  private lastSpeedAt(): number | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i]!;
      if (ev.kind === "speed") return ev.at;
    }
    return null;
  }

  private async tick(): Promise<void> {
    if (this.state !== "playing" || this.source === null) return;
    this.ensureLookahead();

    // Fire every event due at/before the clock. Speed events just advance the
    // cursor (the in-effect speed is derived); valve events set the valve state.
    while (
      this.cursor < this.events.length &&
      this.events[this.cursor]!.at <= this.clock
    ) {
      const ev = this.events[this.cursor]!;
      if (ev.kind === "valve") this.setValve(ev.valve, ev.open);
      this.cursor++;
    }

    // Re-scale the in-effect speed every tick and send only when it changes.
    // This suppresses duplicate sends AND keeps magnitude knobs live without
    // regeneration (scale() reads the source's current knobs each tick).
    const current = this.currentSpeedEvent();
    const output =
      current === null ? 0 : this.source.scale(current, this.context());
    this.currentSpeed = output;
    if (output !== this.lastDeviceSpeed) {
      await this.device().targetSpeedSet(output);
      this.lastDeviceSpeed = output;
    }

    this.clock += TICK_MS * this.rate;
  }

  private setValve(valve: "plus" | "minus", open: boolean): void {
    const dev = this.getDevice();
    if (dev === null) return;
    const result =
      valve === "plus"
        ? dev.valveStrokePlusSet(open)
        : dev.valveStrokeMinusSet(open);
    void result.catch(() => undefined);
  }

  async pause(): Promise<void> {
    if (this.state !== "playing") return;
    this.state = "paused";
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
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

  // Jump the clock to an absolute program-time — an algorithm-specific transport
  // (e.g. Goon's "finish" jumping to the end of its build). Clamped to >= 0; the
  // source decides what a position past its content means (Goon parks at the top).
  seekTo(to: number): void {
    this.seek(Math.max(0, to));
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

  // Re-lay ONLY the valve overlay, keeping the speed script byte-identical — for a
  // knob that shapes valves but not speed (Autopilot's vacuum maintenance). Drop
  // the not-yet-played valve events, ask the source to overlay fresh valves across
  // the retained future speed, and splice them back in. The speed the user is
  // riding is untouched; only the suction reshapes from here on.
  invalidateValves(): void {
    if (this.source === null) return;
    const ctx = this.context();
    // Keep the past (fired) events and ALL speed; drop only future valve events.
    const kept = this.events.filter(
      (e) => e.kind === "speed" || e.at <= this.clock,
    );
    const futureSpeed = kept.filter(
      (e): e is SpeedEvent => e.kind === "speed" && e.at > this.clock,
    );
    // Overlay only as far as the speed is built; ensureLookahead extends the rest.
    const speedEnd =
      futureSpeed.length > 0
        ? futureSpeed[futureSpeed.length - 1]!.at
        : this.clock;
    const valves = this.source.generateValves(
      futureSpeed,
      this.clock,
      speedEnd,
      ctx,
    );
    this.events = [...kept, ...valves].sort((a, b) => a.at - b.at);
    let idx = this.events.findIndex((e) => e.at > this.clock);
    if (idx === -1) idx = this.events.length;
    this.cursor = idx;
    this.notify();
  }

  // Splice a one-off event into the LIVE program at clock + deltaT, keeping the
  // event array sorted — without regenerating. deltaT = 0 lands it at the current
  // clock so the next tick fires it. For ad-hoc events (e.g. a manual stroke
  // pulse) that should ride the existing program rather than re-roll it. No-op
  // while not playing (nothing is ticking) — the caller should drive the device
  // directly in that case.
  insertEvent(
    event: Omit<SpeedEvent, "at"> | Omit<ValveEvent, "at">,
    deltaT = 0,
  ): void {
    if (!this.isPlaying) return;
    const at = this.clock + deltaT;
    const ev = { ...event, at } as ProgramEvent;
    let i = this.cursor;
    while (i < this.events.length && this.events[i]!.at < at) i++;
    this.events.splice(i, 0, ev);
    this.notify();
  }

  // ---- Sparkline source ----

  // The device output over the next windowMs. Renders the live preview whenever
  // a source is set (armed, playing, or paused); flat only when there is no
  // source.
  upcomingWindow(windowMs: number): UpcomingWindow {
    if (this.source === null) {
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
          open: ev.open,
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
