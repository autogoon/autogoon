// Gooning Autopilot — an automatic, timeline-driven slow build. Unlike Homegrown
// (where Speed and Variability are manual knobs), here they are sampled from
// curves at a "program position" that runs 0 -> 30 min:
//   - the dip TOP eases up from 10 -> 100 (raw units) over the 30 minutes;
//   - Variability decreases: the dip floor rises from 50% -> 100% of the top and
//     the timing jitter falls from 80% -> 0, so it starts teasing and finishes
//     as a steady hold at the top.
// Intensity (0-100, manual, default set by the hook) is a FINAL multiplier on
// device output — the direct analogue of Homegrown's speedPercent — so "build to
// 50%" just means intensity 50. Real time advances the position 1:1; forward/back
// offset it by a minute; finish snaps it to the end (where it holds forever via a
// far-future waypoint, the same park trick as cumming). cumming() is Homegrown's
// wind-down, duplicated so this engine stays self-contained.
//
// `currentTime`/`script` are a permanent record of the session (never reset except
// on start()). We keep ~a minute of future built ahead, appending fresh cycles
// each tick; each appended cycle samples the curves at ITS OWN start position, so
// the ramp is smooth and correct even after a jump. An explicit command
// (forward/back/finish/cumming) splices from now — keeping sent waypoints as real
// history and rebuilding only the future.

import type { VacuglideDevice } from "@/lib/vacuglide-device";

interface ScriptWaypoint {
  speed: number;
  at: number;
  // If true, send `speed` as-is — bypass intensity scaling. Only cumming()'s
  // waypoints set this; the normal pattern never does.
  unscaled?: boolean;
}

// The whole build runs over this long. Position is clamped to [0, PROGRAM_MS];
// past the end the pattern holds at the top forever.
const PROGRAM_MS = 30 * 60_000;

// The dip top eases from START_BUILD to PEAK_BUILD (raw device units) across the
// program. EASE_EXPONENT > 1 makes it ease-IN: a patient start that accelerates
// toward the finish (1 would be a straight line).
const START_BUILD = 10;
const PEAK_BUILD = 100;
const EASE_EXPONENT = 1.6;

// Variability endpoints. At position 0 the floor sits at DEEP_FLOOR_FRACTION of
// the top (deep dips) with HIGH_JITTER timing randomisation; both interpolate
// linearly to "no dip, no jitter" at the end.
const DEEP_FLOOR_FRACTION = 0.5;
const HIGH_JITTER = 80;

// Shared dip mechanics (same values as Homegrown, duplicated to stay standalone).
const TICK_MS = 100;
const STEP_MS = 1250;
const STEP_SIZE = 5;
const SLOW_JITTER_CAP = 40;
const PEAK_SPEED = 100;

// How far ahead we keep the script built before appending more.
const SCRIPT_LOOKAHEAD_MS = 60_000;

// forward/back jump this much program time; the tease fires each time position
// crosses a TEASE_INTERVAL_MS boundary (except in the final segment).
const JUMP_MS = 60_000;
const TEASE_INTERVAL_MS = 5 * 60_000;
const TEASE_PULSE_MS = 50;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const roundToStep = (v: number): number => Math.round(v / STEP_SIZE) * STEP_SIZE;

// Normalised progress 0..1 at a program position (ms).
function progress(positionMs: number): number {
  return clamp01(positionMs / PROGRAM_MS);
}

// The dip top (raw units) at a position — eased 10 -> 100, snapped to a whole
// STEP_SIZE so legs divide into whole steps.
function buildTop(positionMs: number): number {
  const eased = Math.pow(progress(positionMs), EASE_EXPONENT);
  return roundToStep(lerp(START_BUILD, PEAK_BUILD, eased));
}

// The dip floor as a fraction of the top: DEEP_FLOOR_FRACTION -> 1 (no dip).
function floorFraction(positionMs: number): number {
  return lerp(DEEP_FLOOR_FRACTION, 1, progress(positionMs));
}

// Timing jitter percent: HIGH_JITTER -> 0.
function jitterPercent(positionMs: number): number {
  return lerp(HIGH_JITTER, 0, progress(positionMs));
}

// One ramp's waypoints: a leading waypoint at `from` then a step every stepMs to
// `to`. All steps share one random duration (one draw per ramp, asymmetric: up to
// `variabilityPercent` faster but at most SLOW_JITTER_CAP slower) so a ramp reads
// as "this ramp is quicker/slower", not step-to-step jitter. A zero-length leg
// (from === to) still consumes a step so the clock advances during a hold.
function buildLeg(
  from: number,
  to: number,
  variabilityPercent: number,
  startAt: number,
): { waypoints: ScriptWaypoint[]; endAt: number } {
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
  if (steps === 0) at += stepMs;
  return { waypoints, endAt: at };
}

// One dip cycle (top -> floor -> top), with top/floor/jitter sampled from the
// curves at `positionMs`. Both endpoints are whole STEP_SIZE multiples. When the
// floor rounds up to the top (late in the program) both legs are zero-length, so
// it becomes a hold at the top — exactly how "no variability" falls out.
function buildGooningCycle(
  positionMs: number,
  startAt: number,
): { waypoints: ScriptWaypoint[]; endAt: number } {
  const top = buildTop(positionMs);
  const floor = Math.min(top, roundToStep(top * floorFraction(positionMs)));
  const jitter = jitterPercent(positionMs);
  const legs: ReadonlyArray<{ from: number; to: number }> = [
    { from: top, to: floor },
    { from: floor, to: top },
  ];
  const waypoints: ScriptWaypoint[] = [];
  let at = startAt;
  for (const leg of legs) {
    const built = buildLeg(leg.from, leg.to, jitter, at);
    waypoints.push(...built.waypoints);
    at = built.endAt;
  }
  return { waypoints, endAt: at };
}

const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 5;
const CUMMING_STEP_MS = 500; // 1 unit per 500ms: 30 units over 15s.

// A one-shot, unscaled wind-down: a smooth constant-rate ramp from 30 to 0, then
// a duplicate of the resting value (0) far in the future — the loop wraps onto
// that far-future waypoint and holds, so nothing needs to track "are we done".
function buildCummingScript(startAt: number): ScriptWaypoint[] {
  const script: ScriptWaypoint[] = [];
  let at = startAt;
  for (let speed = CUMMING_START_SPEED; speed >= CUMMING_MID_SPEED; speed -= 1.5) {
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

export interface GooningAutopilotOptions {
  getDevice: () => VacuglideDevice | null;
  intensity: number;
}

export class GooningAutopilot {
  private readonly getDevice: () => VacuglideDevice | null;

  isPlaying = false;
  currentSpeed = 0;

  private script: ScriptWaypoint[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentTime = 0;
  private currentScriptIndex = 0;
  private lastSentSpeed = 0;
  // The exact (already-scaled) value most recently sent; re-sending the same
  // value briefly stops the device, so we skip a duplicate send. null = nothing
  // sent since the last stop.
  private lastDeviceSpeed: number | null = null;
  private listeners: Array<() => void> = [];
  // Final output multiplier (0-100). The Intensity slider owns this.
  private intensity: number;
  // Added to currentTime to get the program position; forward/back/finish move
  // it. Position is clamp(currentTime + positionOffset, 0, PROGRAM_MS).
  private positionOffset = 0;
  // Highest 5-min tease boundary already fired, so we pulse once per crossing.
  private lastTeaseIndex = 0;
  // One-shot valve timers (cumming pulse, tease pulse); cleared on stop.
  private cumTimers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(opts: GooningAutopilotOptions) {
    this.getDevice = opts.getDevice;
    this.intensity = opts.intensity;
  }

  private get positionMs(): number {
    return Math.max(0, Math.min(PROGRAM_MS, this.currentTime + this.positionOffset));
  }

  // Position of a future script time (ms on the same clock), for sampling curves
  // when appending cycles ahead of now.
  private positionAt(scriptTime: number): number {
    return Math.max(0, Math.min(PROGRAM_MS, scriptTime + this.positionOffset));
  }

  private device(): VacuglideDevice {
    const device = this.getDevice();
    if (device === null) throw new Error("No device connected");
    return device;
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

  getState(): {
    isPlaying: boolean;
    currentSpeed: number;
    positionMs: number;
    programMs: number;
  } {
    return {
      isPlaying: this.isPlaying,
      currentSpeed: this.currentSpeed,
      positionMs: this.positionMs,
      programMs: PROGRAM_MS,
    };
  }

  // Map a raw script speed to device output: intensity is a flat final multiplier
  // (ramp targets raw 100 internally; intensity scales what's sent). cumming's
  // unscaled waypoints pass through untouched.
  private outputSpeed(waypoint: ScriptWaypoint): number {
    if (waypoint.unscaled === true) return waypoint.speed;
    return Math.round((waypoint.speed * this.intensity) / 100);
  }

  // Cut off unsent future (keeping sent waypoints as history) and append the
  // built waypoints starting at the next tick.
  private spliceFromNow(build: (startAt: number) => ScriptWaypoint[]): void {
    this.script = this.script.slice(0, this.currentScriptIndex);
    this.script.push(...build(this.currentTime + TICK_MS));
  }

  // The device output coming up over the next windowMs as {t, speed} points (t in
  // ms from now). Begins at the current in-effect speed; flat at 0 while paused.
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

  // A fresh session: the one place the clock/script/offset reset.
  async start(): Promise<void> {
    this.clearCumTimers();
    this.script = [];
    this.currentScriptIndex = 0;
    this.currentTime = 0;
    this.positionOffset = 0;
    this.lastTeaseIndex = 0;
    this.lastSentSpeed = 0;
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

  // Fire a one-shot 50ms stroke+ tease when the position crosses a new 5-min
  // boundary — but never in the final segment (last TEASE_INTERVAL_MS), so
  // nothing interrupts the approach.
  private maybeTease(): void {
    const pos = this.positionMs;
    const index = Math.floor(pos / TEASE_INTERVAL_MS);
    if (index <= this.lastTeaseIndex) return;
    this.lastTeaseIndex = index;
    if (index < 1) return;
    if (pos >= PROGRAM_MS - TEASE_INTERVAL_MS) return;
    const dev = this.getDevice();
    if (dev === null) return;
    void dev.valveStrokePlusSet(true).catch(() => undefined);
    this.cumTimers.push(
      setTimeout(() => {
        void dev.valveStrokePlusSet(false).catch(() => undefined);
      }, TEASE_PULSE_MS),
    );
  }

  private async timerLoop(): Promise<void> {
    if (!this.isPlaying) return;
    // Keep SCRIPT_LOOKAHEAD_MS of future built. Each appended cycle samples the
    // curves at its own start position. Once the position at the append point has
    // reached the end, park with a single far-future hold at the top instead of
    // churning zero-length cycles (cumming's far-future hold sits past the horizon
    // and is left untouched).
    const horizon = this.currentTime + SCRIPT_LOOKAHEAD_MS;
    while ((this.script[this.script.length - 1]?.at ?? this.currentTime) < horizon) {
      const startAt = this.script[this.script.length - 1]?.at ?? this.currentTime;
      if (this.positionAt(startAt) >= PROGRAM_MS) {
        this.script.push({ speed: PEAK_SPEED, at: startAt + 1_800_000 });
        break;
      }
      const { waypoints } = buildGooningCycle(this.positionAt(startAt), startAt);
      this.script.push(...waypoints);
    }

    this.maybeTease();

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

  // Rebuild the future from the current position after a jump: drop unsent
  // waypoints and append one fresh cycle now, so the sparkline and device react
  // at once (the timer loop keeps extending the horizon afterwards).
  private rebuildFuture(): void {
    this.script = this.script.slice(0, this.currentScriptIndex);
    const startAt = this.currentTime + TICK_MS;
    if (this.positionAt(startAt) >= PROGRAM_MS) {
      this.script.push({ speed: PEAK_SPEED, at: startAt });
      this.script.push({ speed: PEAK_SPEED, at: startAt + 1_800_000 });
    } else {
      const { waypoints } = buildGooningCycle(this.positionAt(startAt), startAt);
      this.script.push(...waypoints);
    }
  }

  // Re-baseline the tease boundary after a jump so a forward re-crossing fires
  // again but the current boundary doesn't double-fire.
  private resyncTease(): void {
    this.lastTeaseIndex = Math.floor(this.positionMs / TEASE_INTERVAL_MS);
  }

  // Update the final multiplier. While playing, immediately resend the current
  // waypoint at the new intensity so the device reacts live.
  setIntensity(percent: number): void {
    this.intensity = Math.max(0, Math.min(100, percent));
    if (!this.isPlaying) {
      this.notify();
      return;
    }
    const current = this.script[this.currentScriptIndex - 1];
    const scaled =
      current !== undefined ? this.outputSpeed(current) : this.currentSpeed;
    this.currentSpeed = scaled;
    this.notify();
    if (scaled === this.lastDeviceSpeed) return;
    this.lastDeviceSpeed = scaled;
    void this.device()
      .targetSpeedSet(scaled)
      .catch(() => undefined);
  }

  forward(): void {
    if (!this.isPlaying) return;
    this.positionOffset += JUMP_MS;
    this.resyncTease();
    this.rebuildFuture();
    this.notify();
  }

  back(): void {
    if (!this.isPlaying) return;
    this.positionOffset -= JUMP_MS;
    this.resyncTease();
    this.rebuildFuture();
    this.notify();
  }

  finish(): void {
    if (!this.isPlaying) return;
    // Snap the position to the end; clamp keeps it there as the clock advances.
    this.positionOffset = PROGRAM_MS - this.currentTime;
    this.resyncTease();
    this.rebuildFuture();
    this.notify();
  }

  // Homegrown's wind-down, duplicated: unscaled ramp 30 -> 0 over 15s, holding at
  // 0, plus a stroke-minus valve pulse. Doesn't touch sent history.
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
    await dev.valveStrokePlusSet(false).catch(() => undefined);
    await dev.valveStrokeMinusSet(false).catch(() => undefined);
  }
}
