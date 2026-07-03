// Homegrown Autopilot algorithm — a fresh, still-to-be-built alternative to the
// Vacuglide Autopilot. It drives the device purely through the getDevice
// accessor it is handed, so it reuses the same device layer
// (useVacuglideDevice) as everything else.
//
// Runs a fixed speed pattern (the speed VALUES never vary): start at 75, step
// down by 5 to 50, step back up by 5 to 100, then step back down by 5 to 75 —
// then repeat. Two knobs scale this uniformly before it's sent to the device:
//   - speedPercent (0-100): scales every raw speed.
//   - variability (off/low/medium/high -> 0/25/50/80%): randomises how long
//     each step takes, one random draw per ramp (the whole 75->50, or
//     50->100, or 100->75 leg) rather than per individual step, so a ramp
//     stays a smooth line at its own pace instead of jittering step to step.
//
// `currentTime` and `script` are a permanent record of the whole play session
// (for a future timeline visualisation) — neither is ever reset to zero once
// start() begins them. Whenever we run out of generated future (normal
// looping) we just append more, continuing the same clock. An explicit
// command (setVariability, cumming) instead cuts off whatever hasn't been
// sent yet — keeping every waypoint already realised as real history — and
// appends its new waypoints starting at the next tick.

import type { VacuglideDevice } from "@/lib/vacuglide-device";

interface ScriptWaypoint {
  speed: number;
  at: number;
  // If true, send `speed` as-is — bypass speedPercent scaling. Only cumming()'s
  // waypoints set this; the normal pattern never does.
  unscaled?: boolean;
}

export type VariabilityLevel = "off" | "low" | "medium" | "high";

const VARIABILITY_PERCENT: Record<VariabilityLevel, number> = {
  off: 0,
  low: 25,
  medium: 50,
  high: 80,
};

const TICK_MS = 100;
const STEP_MS = 2500;
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

// One full cycle (75 -> 50 -> 100 -> 75), continuing from `startAt`.
function buildFullScript(
  variabilityPercent: number,
  startAt: number,
): { waypoints: ScriptWaypoint[]; endAt: number } {
  const script: ScriptWaypoint[] = [{ speed: START_SPEED, at: startAt }];
  let at = startAt;
  for (const leg of LEGS) {
    const { waypoints, endAt } = buildLeg(
      leg.from,
      leg.to,
      variabilityPercent,
      at,
    );
    script.push(...waypoints);
    at = endAt;
  }
  return { waypoints: script, endAt: at };
}

// A one-time seamless transition: finish the ramp currently under way (from
// `fromSpeed`, continuing toward that leg's existing target), play out
// whichever ramps remain to close this cycle back at START_SPEED, then append
// one full fresh cycle so there's always more script ahead once this plays
// out. Continues from `startAt`.
function buildTransitionScript(
  fromSpeed: number,
  currentLeg: number,
  variabilityPercent: number,
  startAt: number,
): ScriptWaypoint[] {
  const script: ScriptWaypoint[] = [];
  let at = startAt;
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
  const { waypoints } = buildFullScript(variabilityPercent, at);
  script.push(...waypoints);
  return script;
}

const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_STEP_MS = 500; // 1 unit per 500ms: 30 units over 15s.
// A one-shot, unscaled wind-down: a smooth constant-rate ramp from 30 to 0,
// then a duplicate of the resting value (0) far in the future — the same
// "hold via a far-future waypoint the loop wraps onto" trick as Vacuglide
// Autopilot's finishMe, so nothing needs to track "are we done cumming".
// Continues from `startAt`.
function buildCummingScript(startAt: number): ScriptWaypoint[] {
  const script: ScriptWaypoint[] = [];
  let at = startAt;
  for (
    let speed = CUMMING_START_SPEED;
    speed >= CUMMING_MID_SPEED;
    speed -= 2
  ) {
    script.push({ speed, at, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  for (let speed = CUMMING_MID_SPEED; speed >= 0; speed--) {
    script.push({ speed, at, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  script.push({ speed: 0, at: at + 1_800_000, unscaled: true });
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

  private script: ScriptWaypoint[] = [];
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
  // One-shot valve timers scheduled by cumming(); cleared if stopped mid-pulse.
  private cumTimers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(opts: HomegrownAutopilotOptions) {
    this.getDevice = opts.getDevice;
    this.speedPercent = opts.speedPercent;
    this.variabilityLevel = opts.variability;
  }

  private get variabilityPercent(): number {
    return VARIABILITY_PERCENT[this.variabilityLevel];
  }

  private scaleSpeed(raw: number): number {
    return Math.round((raw * this.speedPercent) / 100);
  }

  private outputSpeed(waypoint: ScriptWaypoint): number {
    return waypoint.unscaled === true
      ? waypoint.speed
      : this.scaleSpeed(waypoint.speed);
  }

  // Cut off whatever hasn't been sent yet (the future) while keeping
  // everything already sent as real history, then append `waypoints` starting
  // at the next tick.
  private spliceFromNow(build: (startAt: number) => ScriptWaypoint[]): void {
    this.script = this.script.slice(0, this.currentScriptIndex);
    this.script.push(...build(this.currentTime + TICK_MS));
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
  // buildTransitionScript. Doesn't touch anything already sent.
  setVariability(level: VariabilityLevel): void {
    this.variabilityLevel = level;
    if (!this.isPlaying) {
      this.notify();
      return;
    }
    this.spliceFromNow((startAt) =>
      buildTransitionScript(
        this.lastSentSpeed,
        this.currentLeg,
        this.variabilityPercent,
        startAt,
      ),
    );
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

  // A fresh session: this is the one place currentTime/script/currentLeg
  // reset to zero — everything from here on is that session's real history.
  async start(): Promise<void> {
    this.clearCumTimers();
    this.script = [];
    this.currentScriptIndex = 0;
    this.currentTime = 0;
    this.currentLeg = 0;
    this.isPlaying = true;
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
      // Ran out of generated future — extend the timeline with a fresh,
      // freshly-randomised cycle, continuing (never resetting) the clock.
      const last = this.script[this.script.length - 1];
      const { waypoints } = buildFullScript(
        this.variabilityPercent,
        last?.at ?? this.currentTime,
      );
      this.script.push(...waypoints);
      this.currentLeg = 0;
    }
    const waypoint = this.script[this.currentScriptIndex];
    if (waypoint !== undefined && this.currentTime >= waypoint.at) {
      const output = this.outputSpeed(waypoint);
      this.currentSpeed = output;
      await this.device().targetSpeedSet(output);
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

  private clearCumTimers(): void {
    for (const t of this.cumTimers) clearTimeout(t);
    this.cumTimers = [];
  }

  // Writes a one-shot wind-down onto the timeline: unscaled, a smooth
  // constant-rate ramp from 30 to 0 over 15s, holding there afterwards (see
  // buildCummingScript). Doesn't touch anything already sent.
  cumming(): void {
    this.clearCumTimers();
    this.spliceFromNow(buildCummingScript);
    const dev = this.device();
    this.cumTimers.push(
      setTimeout(() => {
        void dev.valveStrokeMinusSet(true).catch(() => undefined);
      }, 3000),
      setTimeout(() => {
        void dev.valveStrokeMinusSet(false).catch(() => undefined);
      }, 8000),
    );
  }

  async pause(): Promise<void> {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.clearTimer();
    this.clearCumTimers();
    this.currentSpeed = 0;
    this.notify();
    const dev = this.device();
    await dev.targetSpeedStop();
    await dev.valveStrokeMinusSet(false).catch(() => undefined);
  }
}
