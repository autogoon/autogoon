// Goon — an automatic, timeline-driven slow build. It IS the manual
// Homegrown algorithm with its two knobs driven automatically over a "program
// position" that runs 0 -> 30 min, so it reuses Homegrown's exact dip machinery:
//   - the dip is always the raw pattern 100 -> floor -> 100 (Homegrown's shape),
//     mapped to the device through Homegrown's curved-low-end scaleSpeed. Depth
//     lives in RAW units, so it is wide and the legs are long early on.
//   - the auto SPEED (Homegrown's speedPercent) eases up from 25 -> 100 over the
//     30 minutes — this is the "build".
//   - the auto VARIABILITY decreases: the raw dip floor rises 50 -> 100 (deep
//     teasing dips -> no dip) and the timing jitter falls 80 -> 0, so it starts
//     with long, deep, slow, randomised dips and finishes as a steady hold.
// Because the dip is raw 100->floor and scaleSpeed pulls the low end toward 0 the
// lower the speed, the early low-speed dips still swing over a wide device range
// (e.g. ~25 down to ~3) rather than a narrow band near the top.
// Intensity (0-100, manual, default set by the hook) is a FINAL multiplier on the
// scaled output — so "build to 50%" just means intensity 50. Real time advances
// the position 1:1; forward/back offset it by a minute; finish snaps it to the end
// (where it holds forever via a far-future waypoint, the same park trick as
// cumming). cumming() is Homegrown's wind-down, duplicated so this engine stays
// self-contained.
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

// The auto "build" — Homegrown's speedPercent — eases from BUILD_START to
// BUILD_PEAK across the program. BUILD_EXP > 1 makes it ease-IN: a patient start
// that accelerates toward the finish (1 would be a straight line). BUILD_START is
// 25 (not 0) so the very start still swings up to ~25% at full intensity.
const BUILD_START = 25;
const BUILD_PEAK = 100;
const BUILD_EXP = 1.3;

// Variability endpoints, in RAW units like Homegrown. At position 0 the dip floor
// is VAR_FLOOR_DEEP (a deep 100->50 dip) with VAR_JITTER_HIGH timing randomisation;
// both interpolate linearly to "no dip (floor 100), no jitter" at the end.
const VAR_FLOOR_DEEP = 50;
const VAR_FLOOR_SHALLOW = 100;
const VAR_JITTER_HIGH = 80;

// Shared dip mechanics (same values as Homegrown, duplicated to stay standalone).
const TICK_MS = 100;
const STEP_MS = 1250;
const STEP_SIZE = 5;
const SLOW_JITTER_CAP = 40;
const PEAK_SPEED = 100;

// scaleSpeed's low-end curve (Homegrown's LOW_END_GAMMA): the exponent grows as
// the speed falls, pulling the dip's low point toward 0 so slow settings still
// get a wide range instead of a narrow band near the top. 0 would be flat linear.
const LOW_END_GAMMA = 2.5;

// How far ahead we keep the script built before appending more.
const SCRIPT_LOOKAHEAD_MS = 60_000;

// forward/back jump this much program time.
const JUMP_MS = 60_000;

// faster/slower dilate time: the program position advances TICK_MS * timeScale per
// tick. Each press multiplies/divides the scale by RATE_STEP (~5% faster/slower
// from that point on), clamped to [MIN_TIME_SCALE, MAX_TIME_SCALE].
const RATE_STEP = 1.05;
const MIN_TIME_SCALE = 0.25;
const MAX_TIME_SCALE = 4;

// Auto teasing has two phases. Before STROKE_PLUS_START_MS it fires a 5s stroke-
// pulse every STROKE_MINUS_INTERVAL_MS (a minute), starting at 0; from then on it
// fires a 50ms stroke+ pulse every TEASE_INTERVAL_MS (five minutes), except in the
// final segment (last TEASE_INTERVAL_MS) so nothing interrupts the approach.
const STROKE_PLUS_START_MS = 10 * 60_000;
const STROKE_MINUS_INTERVAL_MS = 60_000;
const STROKE_MINUS_PULSE_MS = 5000;
const TEASE_INTERVAL_MS = 5 * 60_000;
const TEASE_PULSE_MS = 50;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const roundToStep = (v: number): number => Math.round(v / STEP_SIZE) * STEP_SIZE;

// Normalised progress 0..1 at a program position (ms).
function progress(positionMs: number): number {
  return clamp01(positionMs / PROGRAM_MS);
}

// The auto build (Homegrown's speedPercent) at a position — eased 25 -> 100.
function buildSpeedPercent(positionMs: number): number {
  const eased = Math.pow(progress(positionMs), BUILD_EXP);
  return lerp(BUILD_START, BUILD_PEAK, eased);
}

// The raw dip floor (Homegrown's variability floor) at a position: VAR_FLOOR_DEEP
// -> VAR_FLOOR_SHALLOW, snapped to a whole STEP_SIZE so the 100->floor legs divide
// into whole steps. At the end floor === 100, so the dip collapses to a hold.
function variabilityFloor(positionMs: number): number {
  return roundToStep(
    lerp(VAR_FLOOR_DEEP, VAR_FLOOR_SHALLOW, progress(positionMs)),
  );
}

// Timing jitter percent at a position: VAR_JITTER_HIGH -> 0.
function variabilityJitter(positionMs: number): number {
  return lerp(VAR_JITTER_HIGH, 0, progress(positionMs));
}

// Homegrown's scaleSpeed, verbatim: map a raw pattern speed (floor..100) to the
// pre-intensity device value. The peak (raw 100) scales linearly to speedPercent;
// lower raw speeds are pulled toward 0 harder as the speed falls, via an exponent
// that grows from 1 (at full speed) upward as speedPercent drops.
function scaleSpeed(raw: number, speedPercent: number): number {
  if (speedPercent <= 0) return 0;
  const exponent = 1 + LOW_END_GAMMA * (1 - speedPercent / 100);
  return Math.round(speedPercent * Math.pow(raw / PEAK_SPEED, exponent));
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

// One dip cycle: the raw Homegrown pattern PEAK_SPEED -> floor -> PEAK_SPEED
// (floor and jitter sampled from the variability curves at `positionMs`), with
// every raw waypoint mapped through scaleSpeed at this position's build level. The
// stored speeds are therefore the pre-intensity device values (outputSpeed applies
// intensity on top). When the floor reaches PEAK_SPEED (end of program) both legs
// are zero-length, so it becomes a hold at the top — how "no variability" falls out.
function buildGoonCycle(
  positionMs: number,
  startAt: number,
): { waypoints: ScriptWaypoint[]; endAt: number } {
  const speedPercent = buildSpeedPercent(positionMs);
  const floor = variabilityFloor(positionMs);
  const jitter = variabilityJitter(positionMs);
  const legs: ReadonlyArray<{ from: number; to: number }> = [
    { from: PEAK_SPEED, to: floor },
    { from: floor, to: PEAK_SPEED },
  ];
  const waypoints: ScriptWaypoint[] = [];
  let at = startAt;
  for (const leg of legs) {
    const built = buildLeg(leg.from, leg.to, jitter, at);
    for (const wp of built.waypoints) {
      waypoints.push({ speed: scaleSpeed(wp.speed, speedPercent), at: wp.at });
    }
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

export interface GoonOptions {
  getDevice: () => VacuglideDevice | null;
  intensity: number;
}

export class Goon {
  private readonly getDevice: () => VacuglideDevice | null;

  isPlaying = false;
  currentSpeed = 0;

  private script: ScriptWaypoint[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentTime = 0;
  private currentScriptIndex = 0;
  // The exact (already-scaled) value most recently sent; re-sending the same
  // value briefly stops the device, so we skip a duplicate send. null = nothing
  // sent since the last stop.
  private lastDeviceSpeed: number | null = null;
  private listeners: Array<() => void> = [];
  // Final output multiplier (0-100). The Intensity slider owns this.
  private intensity: number;
  // The program position (ms into the 0..PROGRAM_MS build), decoupled from the
  // real script clock so time can be dilated. It advances TICK_MS * timeScale each
  // tick; forward/back/finish move it directly.
  private programPos = 0;
  // Time-dilation factor: 1 = real time, >1 faster, <1 slower. faster()/slower().
  private timeScale = 1;
  // Highest boundary already fired for each tease phase, so each pulses once per
  // crossing: the 1-min stroke- phase and the 5-min stroke+ phase. Minus starts at
  // -1 so the 0-min boundary fires a stroke- right at session start.
  private lastMinusIndex = -1;
  private lastPlusIndex = 0;
  // One-shot valve timers (cumming pulse, tease pulse); cleared on stop.
  private cumTimers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(opts: GoonOptions) {
    this.getDevice = opts.getDevice;
    this.intensity = opts.intensity;
  }

  private get positionMs(): number {
    return Math.max(0, Math.min(PROGRAM_MS, this.programPos));
  }

  // Program position at a future script time, for sampling curves when appending
  // cycles ahead of now — it advances from the current programPos at the current
  // timeScale (a splice/rebuild re-bases this whenever the scale changes).
  private positionAt(scriptTime: number): number {
    const ahead = (scriptTime - this.currentTime) * this.timeScale;
    return Math.max(0, Math.min(PROGRAM_MS, this.programPos + ahead));
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
    timeScale: number;
  } {
    return {
      isPlaying: this.isPlaying,
      currentSpeed: this.currentSpeed,
      positionMs: this.positionMs,
      programMs: PROGRAM_MS,
      timeScale: this.timeScale,
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
    this.clearTimer();
    this.clearCumTimers();
    this.script = [];
    this.currentScriptIndex = 0;
    this.currentTime = 0;
    this.programPos = 0;
    this.timeScale = 1;
    this.lastMinusIndex = -1;
    this.lastPlusIndex = 0;
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

  // Two-phase auto teasing, jump-aware — each phase's index advances even when the
  // pulse is suppressed, so a crossing never double-fires:
  //   - before STROKE_PLUS_START_MS (first 10 min): a 5s stroke- pulse every minute,
  //     starting at 0;
  //   - from STROKE_PLUS_START_MS on: a 50ms stroke+ pulse every 5 min, except in
  //     the final segment (last TEASE_INTERVAL_MS).
  private maybeTease(): void {
    const pos = this.positionMs;
    const dev = this.getDevice();

    const minusIndex = Math.floor(pos / STROKE_MINUS_INTERVAL_MS);
    if (minusIndex > this.lastMinusIndex) {
      this.lastMinusIndex = minusIndex;
      if (pos < STROKE_PLUS_START_MS && dev !== null) {
        void dev.valveStrokeMinusSet(true).catch(() => undefined);
        this.cumTimers.push(
          setTimeout(() => {
            void dev.valveStrokeMinusSet(false).catch(() => undefined);
          }, STROKE_MINUS_PULSE_MS),
        );
      }
    }

    const plusIndex = Math.floor(pos / TEASE_INTERVAL_MS);
    if (plusIndex > this.lastPlusIndex) {
      this.lastPlusIndex = plusIndex;
      if (
        pos >= STROKE_PLUS_START_MS &&
        pos < PROGRAM_MS - TEASE_INTERVAL_MS &&
        dev !== null
      ) {
        void dev.valveStrokePlusSet(true).catch(() => undefined);
        this.cumTimers.push(
          setTimeout(() => {
            void dev.valveStrokePlusSet(false).catch(() => undefined);
          }, TEASE_PULSE_MS),
        );
      }
    }
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
      const { waypoints } = buildGoonCycle(this.positionAt(startAt), startAt);
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
      this.currentScriptIndex++;
    }
    this.currentTime += TICK_MS;
    this.programPos = Math.max(
      0,
      Math.min(PROGRAM_MS, this.programPos + TICK_MS * this.timeScale),
    );
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
      const { waypoints } = buildGoonCycle(this.positionAt(startAt), startAt);
      this.script.push(...waypoints);
    }
  }

  // Re-baseline both tease boundaries after a jump so a forward re-crossing fires
  // again but the current boundary doesn't double-fire.
  private resyncTease(): void {
    const pos = this.positionMs;
    this.lastMinusIndex = Math.floor(pos / STROKE_MINUS_INTERVAL_MS);
    this.lastPlusIndex = Math.floor(pos / TEASE_INTERVAL_MS);
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

  private clampPos(pos: number): number {
    return Math.max(0, Math.min(PROGRAM_MS, pos));
  }

  forward(): void {
    if (!this.isPlaying) return;
    this.programPos = this.clampPos(this.programPos + JUMP_MS);
    this.resyncTease();
    this.rebuildFuture();
    this.notify();
  }

  back(): void {
    if (!this.isPlaying) return;
    this.programPos = this.clampPos(this.programPos - JUMP_MS);
    this.resyncTease();
    this.rebuildFuture();
    this.notify();
  }

  finish(): void {
    if (!this.isPlaying) return;
    // Snap the position to the end; it stays there as the clock advances.
    this.programPos = PROGRAM_MS;
    this.resyncTease();
    this.rebuildFuture();
    this.notify();
  }

  // Dilate time from this point on: faster multiplies the scale by RATE_STEP,
  // slower divides by it (each ~5%), clamped. The position doesn't jump — only its
  // rate of advance changes — but we rebuild the future so upcoming cycles (and the
  // sparkline) re-sample at the new scale immediately.
  private setTimeScale(scale: number): void {
    if (!this.isPlaying) return;
    this.timeScale = Math.max(MIN_TIME_SCALE, Math.min(MAX_TIME_SCALE, scale));
    this.rebuildFuture();
    this.notify();
  }

  faster(): void {
    this.setTimeScale(this.timeScale * RATE_STEP);
  }

  slower(): void {
    this.setTimeScale(this.timeScale / RATE_STEP);
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
