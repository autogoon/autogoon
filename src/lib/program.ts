// The shared program/player contract. A program is a single array of timed
// events over "program-time" (ms). The Player owns the clock and plays events;
// each algorithm is an AlgorithmEngine that only produces events and scales them.

// Player timing.
export const TICK_MS = 100; // clock resolution / send cadence
export const LOOKAHEAD_MS = 120_000; // keep 2 min of future built ahead
export const JUMP_MS = 60_000; // forward/back transport distance
export const RATE_STEP = 1.05; // faster/slower multiply/divide the rate by this
export const MIN_RATE = 0.25;
export const MAX_RATE = 4;

// A target-speed change. `speed` is raw (pattern space); the Player runs it
// through AlgorithmEngine.scale() at send time. `unscaled` bypasses scale() —
// only wind-down (cumming/finish) ramps set it.
export interface SpeedEvent {
  kind: "speed";
  at: number;
  speed: number;
  unscaled?: boolean;
}

// A single valve state change: the Player sets the valve open or closed at `at`.
// A pulse is TWO events — an open and a later close — so a variable-length hold
// (the manual Stroke buttons) and a fixed pulse (tease/suction/cumming) share one
// representation.
export interface ValveEvent {
  kind: "valve";
  at: number;
  valve: "plus" | "minus";
  open: boolean;
}

export type ProgramEvent = SpeedEvent | ValveEvent;

// Read-only view of Player state handed to the engine on each call.
export interface PlayerContext {
  clock: number; // current program-time (ms)
  currentSpeed: number; // device speed in effect now (post-scale), 0 if none
  currentRawSpeed: number; // raw speed of the SpeedEvent under the cursor, 0 if none
}

export interface AlgorithmEngine {
  // A fresh session is starting: clear transient state (e.g. "just changed"
  // flags, cumming). Called by the Player when an engine is set.
  reset(): void;

  // Extend the timeline: return events with `at` in [fromTime, untilTime),
  // sorted non-decreasing by `at`, in whole cycles so each call resumes from a
  // clean boundary. May read ctx and keep private generation state. Return [] to
  // park (nothing more to generate until something changes).
  generate(
    fromTime: number,
    untilTime: number,
    ctx: PlayerContext,
  ): ProgramEvent[];

  // Map a raw SpeedEvent to the device speed given the engine's current knobs.
  // Honours `unscaled`. Called every tick, so magnitude knobs stay live without
  // regeneration.
  scale(event: SpeedEvent, ctx: PlayerContext): number;
}
