// Pure timing for ambient chat — how long until she next fills a silence —
// kept out of the voice session so it can be unit-tested. The session owns the
// timer and the decision to arm one; this owns only the number.

import type { Companion } from './companions';

// What an ambient turn is given instead of something you said. Injected into
// that one request and never stored, the way a gap marker is — so it prompts
// her without accumulating in the thread or appearing in the transcript.
//
// It carries no instruction about what to say: she has the conversation and the
// device's state in front of her, and deciding what a silence needs is the
// persona's job. All it supplies is the one thing she can't see for herself —
// that a beat has passed and nobody filled it.
export const AMBIENT_CUE = '(A quiet beat passes. He has not said anything.)';

// Two curves rather than one scaled, because the situations don't share a sense
// of "a while": out of play she's filling a conversational pause, in play she's
// talking over a running device, where the same gap feels far longer. Which
// applies is the only thing the program's state decides — it never gates
// whether she speaks at all.
const outOfPlayMs = (trait: number): number => 60_000 - 10_000 * trait;
const inPlayMs = (trait: number): number => 30_000 - 5_000 * trait;

// Spread around the base delay, as fractions of it. Lopsided on purpose: early
// reads as eager, late as having forgotten you, so there's more room below than
// above. The consequence is that the base is not the typical delay — a uniform
// sample across this range averages 0.85× it.
const JITTER_MIN = -0.5;
const JITTER_MAX = 0.2;

// The delay before her next ambient turn. `rand` is a 0–1 sample (the caller
// passes Math.random) — an argument rather than a call inside, so the mapping
// stays pure and the jitter is testable at its edges instead of by chance.
//
// Note this is measured from when she stops speaking, so the gap between the
// starts of two turns is this plus a whole turn cycle: time to first token, the
// TTS request, and however long she talks. The felt cadence is always slower
// than the number here.
export function ambientDelayMs(
  companion: Companion,
  playing: boolean,
  rand: number,
): number {
  // A trait outside 1–5 is an authoring mistake. The manifest rejects one on
  // import, so anything arriving here came from elsewhere — clamp rather than
  // return a nonsensical delay (at 6 the in-play curve reaches zero, and past
  // that it goes negative).
  const raw = playing ? companion.playfulness : companion.chattiness;
  const trait = Math.min(5, Math.max(1, raw));
  const base = playing ? inPlayMs(trait) : outOfPlayMs(trait);
  return Math.round(base * (1 + JITTER_MIN + rand * (JITTER_MAX - JITTER_MIN)));
}
