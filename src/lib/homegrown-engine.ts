// Homegrown algorithm — a fresh, still-to-be-built alternative to the
// Autopilot. It drives the device purely through the getDevice
// accessor it is handed, so it reuses the same device layer
// (useVacuglideDevice) as everything else.
//
// Runs a repeating dip pattern: 100 -> floor -> 100, stepping by 5. Two knobs
// shape it before it's sent to the device:
//   - speedPercent (0-100): scales the pattern onto the device. The peak tracks
//     it linearly (raw 100 -> speedPercent), but the ramp's low point is pulled
//     further toward 0 the lower the speed, so slow settings still get a usefully
//     wide range instead of a narrow band near the top (see scaleSpeed).
//   - variability (off/low/medium/high): a single control driving BOTH the dip
//     depth and the timing randomisation:
//       floor  100 / 85 / 65 / 50   (off never dips — it holds at 100)
//       jitter  each ramp can run up to 0 / 25 / 50 / 80% faster but at most
//               40% slower (asymmetric, so high can't drag out) — one draw per
//               ramp (not per step), so a ramp stays a smooth line at its pace.
//
// `currentTime` and `script` are a permanent record of the whole play session
// (for a future timeline visualisation) — neither is ever reset to zero once
// start() begins them. Whenever we run out of generated future (normal
// looping) we just append more, continuing the same clock. An explicit
// command (setVariability, cumming) instead cuts off whatever hasn't been
// sent yet — keeping every waypoint already realised as real history — and
// appends its new waypoints starting at the next tick. A variability change
// first ramps back up to 100 (at a fixed 10 units/sec) so the switch to the
// new dip depth is never jarring.

import type { VacuglideDevice } from "@/lib/vacuglide-device";

interface ScriptWaypoint {
  speed: number;
  at: number;
  // If true, send `speed` as-is — bypass speedPercent scaling. Only cumming()'s
  // waypoints set this; the normal pattern never does.
  unscaled?: boolean;
}

export type VariabilityLevel = "off" | "low" | "medium" | "high";

// How deep each level dips below the 100 peak. off never dips (floor === peak),
// so it just holds at 100. All floors are multiples of STEP_SIZE.
const VARIABILITY_FLOOR: Record<VariabilityLevel, number> = {
  off: 100,
  low: 85,
  medium: 65,
  high: 50,
};

// How much each ramp's timing is randomised (one draw per ramp). This is the
// amount a ramp can speed UP by; the slow side is capped separately by
// SLOW_JITTER_CAP so high variability can't drag a leg out.
const VARIABILITY_PERCENT: Record<VariabilityLevel, number> = {
  off: 0,
  low: 25,
  medium: 50,
  high: 80,
};

// The jitter is asymmetric: a ramp can get up to VARIABILITY_PERCENT faster, but
// only up to this much slower. So high runs -80%..+40% rather than ±80%.
const SLOW_JITTER_CAP = 40;

const TICK_MS = 100;
const STEP_MS = 1250;
const STEP_SIZE = 5;
const PEAK_SPEED = 100;

// The Speed slider doesn't scale the pattern flatly. The peak tracks it linearly
// (raw 100 -> speedPercent), but the ramp's low point is pulled toward 0 as the
// speed drops — otherwise a low speed leaves a uselessly narrow band near the top
// (e.g. 5-10 at 10%). scaleSpeed raises raw/100 to an exponent that grows as the
// speed falls; this controls how aggressively. 0 would be a flat linear scale.
const LOW_END_GAMMA = 2.5;

// How far ahead of the current time we keep the script built. Once the generated
// future drops below this, we append fresh cycles until it's covered again.
const SCRIPT_LOOKAHEAD_MS = 60_000;

// A variability change ramps back up to the peak at a fixed rate before the new
// dip begins: 5 units every 500ms === 10 units/sec.
const RECOVERY_STEP = STEP_SIZE;
const RECOVERY_STEP_MS = 500;

// The two ramps of one cycle: 100 -> floor -> 100. Peak and floor are both
// multiples of STEP_SIZE, so each ramp divides into whole steps. When floor is
// 100 ("off") both ramps are zero-length and the pattern just holds at 100.
function legsForFloor(floor: number): ReadonlyArray<{ from: number; to: number }> {
  return [
    { from: PEAK_SPEED, to: floor },
    { from: floor, to: PEAK_SPEED },
  ];
}

// One ramp's waypoints: a leading waypoint at `from` (so the start of every leg
// is recorded — this is what makes an "off" hold at 100 fall out naturally) then
// a step every `stepMs` up/down to `to`. All steps share a single random
// duration (the standard STEP_MS when variabilityPercent is 0) so the randomness
// reads as "this ramp is quicker/slower", not step-to-step jitter.
function buildLeg(
  from: number,
  to: number,
  variabilityPercent: number,
  startAt: number,
): { waypoints: ScriptWaypoint[]; endAt: number } {
  // Asymmetric jitter, uniform in [-down, +up]: a ramp can speed up by the full
  // variabilityPercent but slow down by at most SLOW_JITTER_CAP.
  const down = variabilityPercent / 100;
  const up = Math.min(variabilityPercent, SLOW_JITTER_CAP) / 100;
  const jitter = -down + Math.random() * (down + up);
  const stepMs = Math.max(1, Math.round(STEP_MS * (1 + jitter)));
  const direction = to > from ? STEP_SIZE : -STEP_SIZE;
  const steps = Math.abs(to - from) / STEP_SIZE;
  const waypoints: ScriptWaypoint[] = [{ speed: from, at: startAt }];
  let at = startAt;
  let speed = from;
  for (let i = 0; i < steps; i++) {
    speed += direction;
    at += stepMs;
    waypoints.push({ speed, at });
  }
  // A zero-length leg (floor === 100) still consumes a step so the clock
  // advances and the hold at 100 doesn't churn a waypoint every tick.
  if (steps === 0) at += stepMs;
  return { waypoints, endAt: at };
}

// One full cycle (100 -> floor -> 100), continuing from `startAt`.
function buildFullScript(
  floor: number,
  variabilityPercent: number,
  startAt: number,
): { waypoints: ScriptWaypoint[]; endAt: number } {
  const script: ScriptWaypoint[] = [];
  let at = startAt;
  for (const leg of legsForFloor(floor)) {
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

// A one-time recovery when variability changes: ramp from wherever we are
// (`fromSpeed`) back up to the 100 peak at a fixed 10 units/sec — regardless of
// where in the dip we were, so the change is never jarring — then append one
// full fresh cycle at the new floor so there's always more script ahead.
// Continues from `startAt`.
function buildRecoveryScript(
  fromSpeed: number,
  floor: number,
  variabilityPercent: number,
  startAt: number,
): ScriptWaypoint[] {
  const script: ScriptWaypoint[] = [];
  let at = startAt;
  for (
    let speed = fromSpeed + RECOVERY_STEP;
    speed <= PEAK_SPEED;
    speed += RECOVERY_STEP
  ) {
    at += RECOVERY_STEP_MS;
    script.push({ speed, at });
  }
  const { waypoints } = buildFullScript(floor, variabilityPercent, at);
  script.push(...waypoints);
  return script;
}

const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 5;
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
    speed -= 1.5
  ) {
    script.push({ speed, at, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  for (let speed = CUMMING_MID_SPEED; speed >= CUMMING_END_SPEED; speed--) {
    script.push({ speed, at, unscaled: true });
    at += CUMMING_STEP_MS;
  }
  script.push({ speed: 0, at: at + 1_800_000, unscaled: true });
  return script;
}

export interface HomegrownOptions {
  getDevice: () => VacuglideDevice | null;
  speedPercent: number;
  variability: VariabilityLevel;
}

export class Homegrown {
  private readonly getDevice: () => VacuglideDevice | null;

  isPlaying = false;
  currentSpeed = 0;

  private script: ScriptWaypoint[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentTime = 0;
  private currentScriptIndex = 0;
  private lastSentSpeed = PEAK_SPEED;
  // The exact (already-scaled) value most recently sent to the device. Re-sending
  // the speed it's already running at makes it briefly stop, so we skip the send
  // when the new output matches this. null means "nothing sent since the last
  // stop", so the next value always goes through.
  private lastDeviceSpeed: number | null = null;
  private listeners: Array<() => void> = [];
  // The script's speeds are "raw" — everything actually sent to the device is
  // this percentage of that raw value, so the Speed slider can tame or amplify
  // the whole pattern uniformly.
  private speedPercent: number;
  private variabilityLevel: VariabilityLevel;
  // One-shot valve timers scheduled by cumming(); cleared if stopped mid-pulse.
  private cumTimers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(opts: HomegrownOptions) {
    this.getDevice = opts.getDevice;
    this.speedPercent = opts.speedPercent;
    this.variabilityLevel = opts.variability;
  }

  private get variabilityPercent(): number {
    return VARIABILITY_PERCENT[this.variabilityLevel];
  }

  private get floor(): number {
    return VARIABILITY_FLOOR[this.variabilityLevel];
  }

  // Map a raw pattern speed (floor..100) to what's actually sent to the device.
  // The peak (raw 100) scales linearly to speedPercent; lower raw speeds are
  // pulled down harder as the speed falls, via an exponent that grows from 1 (at
  // full speed, a plain linear scale) upward as speedPercent drops. Pure in
  // (raw, speedPercent) — no dependence on the current floor — so it stays
  // consistent across variability changes.
  private scaleSpeed(raw: number): number {
    if (this.speedPercent <= 0) return 0;
    const exponent = 1 + LOW_END_GAMMA * (1 - this.speedPercent / 100);
    return Math.round(this.speedPercent * Math.pow(raw / PEAK_SPEED, exponent));
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
    if (scaled === this.lastDeviceSpeed) return;
    this.lastDeviceSpeed = scaled;
    void this.device()
      .targetSpeedSet(scaled)
      .catch(() => undefined);
  }

  // Update the dip depth and timing randomisation. While playing, ramp back up
  // to the peak before the new dip begins — see buildRecoveryScript. Doesn't
  // touch anything already sent.
  setVariability(level: VariabilityLevel): void {
    this.variabilityLevel = level;
    if (!this.isPlaying) {
      this.notify();
      return;
    }
    this.spliceFromNow((startAt) =>
      buildRecoveryScript(
        this.lastSentSpeed,
        this.floor,
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

  // The speeds coming up over the next `windowMs`, as {t, speed} points with t
  // in ms from now (0..windowMs). Begins with the speed currently in effect so a
  // sparkline can step straight from the present value, and always ends at
  // windowMs. Speeds are the actual device output — raw script speeds run through
  // outputSpeed (so speedPercent scaling is applied, matching what's sent and
  // what Autopilot's already-scaled script reports). Flat at 0 while
  // paused. Scans only from the playback cursor, never the whole history.
  getUpcomingCurve(windowMs: number): Array<{ t: number; speed: number }> {
    if (!this.isPlaying) {
      return [
        { t: 0, speed: 0 },
        { t: windowMs, speed: 0 },
      ];
    }
    const now = this.currentTime;
    const end = now + windowMs;
    const current = this.script[this.currentScriptIndex - 1];
    let inEffect = current !== undefined ? this.outputSpeed(current) : 0;
    const points: Array<{ t: number; speed: number }> = [];
    for (let i = this.currentScriptIndex; i < this.script.length; i++) {
      const wp = this.script[i]!;
      if (wp.at > end) break;
      if (wp.at <= now) {
        inEffect = this.outputSpeed(wp);
        continue;
      }
      points.push({ t: wp.at - now, speed: this.outputSpeed(wp) });
    }
    const curve = [{ t: 0, speed: inEffect }, ...points];
    const last = curve[curve.length - 1]!;
    if (last.t < windowMs) curve.push({ t: windowMs, speed: last.speed });
    return curve;
  }

  private device(): VacuglideDevice {
    const device = this.getDevice();
    if (device === null) throw new Error("No device connected");
    return device;
  }

  // A fresh session: this is the one place currentTime/script reset to zero —
  // everything from here on is that session's real history.
  async start(): Promise<void> {
    this.clearCumTimers();
    this.script = [];
    this.currentScriptIndex = 0;
    this.currentTime = 0;
    this.lastDeviceSpeed = null;
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
    // Keep at least SCRIPT_LOOKAHEAD_MS of future built ahead of now. Append
    // fresh, freshly-randomised cycles (continuing, never resetting, the clock)
    // until the horizon is covered. cumming()'s far-future hold sits well past
    // the horizon, so this leaves it untouched.
    const horizon = this.currentTime + SCRIPT_LOOKAHEAD_MS;
    while ((this.script[this.script.length - 1]?.at ?? this.currentTime) < horizon) {
      const last = this.script[this.script.length - 1];
      const { waypoints } = buildFullScript(
        this.floor,
        this.variabilityPercent,
        last?.at ?? this.currentTime,
      );
      this.script.push(...waypoints);
    }
    const waypoint = this.script[this.currentScriptIndex];
    if (waypoint !== undefined && this.currentTime >= waypoint.at) {
      const output = this.outputSpeed(waypoint);
      this.currentSpeed = output;
      if (output !== this.lastDeviceSpeed) {
        await this.device().targetSpeedSet(output);
        this.lastDeviceSpeed = output;
      }
      this.lastSentSpeed = waypoint.speed;
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
      }, 12000),
    );
  }

  async pause(): Promise<void> {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.clearTimer();
    this.clearCumTimers();
    this.currentSpeed = 0;
    this.lastDeviceSpeed = null;
    this.notify();
    const dev = this.device();
    await dev.targetSpeedStop();
    await dev.valveStrokeMinusSet(false).catch(() => undefined);
  }
}
