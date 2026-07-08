// The shared program/player contract. A program is a single array of timed
// events over "program-time" (ms). The Player owns the clock and plays events;
// each algorithm is an AlgorithmEngine that only produces events and scales them.

// Player timing.
export const TICK_MS = 100; // clock resolution / send cadence
// Keep 5 min of future built ahead. Must cover the widest sparkline preview: at
// MAX_RATE (4×) the preview shows UPCOMING_WINDOW_MS × 4 = 4 min of program-time,
// so anything less would leave the sparkline's tail flat at high dilation.
export const LOOKAHEAD_MS = 300_000;
export const JUMP_MS = 60_000; // forward/back transport distance
export const RATE_STEP = 1.05; // faster/slower multiply/divide the rate by this
export const MIN_RATE = 0.25;
export const MAX_RATE = 4;

// The look-ahead window the upcoming-speed preview covers (what the sparkline
// draws). A preview concept, so it lives with the player contract, not the SVG.
export const UPCOMING_WINDOW_MS = 60_000;

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

// The upcoming-speed preview the Player derives for the sparkline. A step point
// (`t` is ms from now, 0..UPCOMING_WINDOW_MS) and a scheduled valve change; both
// are algorithm-agnostic — the Player produces them, the Sparkline draws them.
export type CurvePoint = { t: number; speed: number };
export type ValveMarker = { t: number; valve: "plus" | "minus"; open: boolean };

export interface UpcomingWindow {
  speed: CurvePoint[];
  valves: ValveMarker[];
}

// The Player's transport state — the single source of truth the hooks, runner
// and panels all read. "armed" = a program is built and previewed but the tick
// loop is not running; "paused" = halted with position held (Start resumes).
export type PlayerState = "armed" | "playing" | "paused";

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

  // Two generation channels, split because speed is the stateful backbone and
  // valves are an overlay *derived from* it (a suction pulse's shape can depend
  // on the speed in effect at that moment). Splitting lets the Player re-lay the
  // valve overlay over an unchanged speed script (see Player.invalidateValves).

  // Extend the speed timeline: return SpeedEvents with `at` in
  // [fromTime, untilTime), sorted non-decreasing by `at`, in whole cycles so
  // each call resumes from a clean boundary. May read ctx and keep private
  // generation state. Return [] to park (nothing more until something changes).
  generateSpeed(
    fromTime: number,
    untilTime: number,
    ctx: PlayerContext,
  ): SpeedEvent[];

  // Overlay valve events across a span of already-built speed. `speedEvents` is
  // the speed covering [fromTime, untilTime) (so a pulse can read the speed in
  // effect at its moment); return ValveEvents with `at` in [fromTime, untilTime),
  // sorted non-decreasing. Must be a pure function of its inputs + the engine's
  // knobs (no cadence state), so the Player can re-run it to re-lay the overlay.
  generateValves(
    speedEvents: SpeedEvent[],
    fromTime: number,
    untilTime: number,
    ctx: PlayerContext,
  ): ValveEvent[];

  // Map a raw SpeedEvent to the device speed given the engine's current knobs.
  // Honours `unscaled`. Called every tick, so magnitude knobs stay live without
  // regeneration.
  scale(event: SpeedEvent, ctx: PlayerContext): number;
}
