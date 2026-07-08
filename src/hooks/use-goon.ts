"use client";

// The Goon algorithm as a React hook. It owns only what is actually Goon's: the
// Intensity knob, the keyword vocabulary, and the transport commands. It reads
// the shared player view (from usePlayer) to know whether it is the active
// source, but it no longer mirrors player state itself — the sparkline, current
// speed and timeline all come from that one shared view.

import { useCallback, useMemo, useRef, useState } from "react";
import { Goon, PROGRAM_MS } from "@/lib/goon-engine";
import { useAlgorithmSource } from "@/hooks/use-algorithm-source";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import type { PlayerView } from "@/hooks/use-player";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

const DEFAULT_INTENSITY = 50;
const INTENSITY_STEP = 10;

export function useGoon(vacuglide: VacuglideDeviceController, view: PlayerView) {
  const { player, log } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);

  const sourceRef = useRef<Goon | null>(null);
  sourceRef.current ??= new Goon({ intensity: DEFAULT_INTENSITY });
  const source = sourceRef.current;

  const { isCurrent, state, currentSpeed, start, stop, arm, whenCurrent } =
    useAlgorithmSource(vacuglide, source, view);

  const changeIntensity = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      setIntensity(clamped);
      source.setIntensity(clamped);
      whenCurrent(() => player.refresh());
    },
    [player, source, whenCurrent],
  );

  const stepIntensity = useCallback(
    (delta: number) => changeIntensity(intensity + delta),
    [intensity, changeIntensity],
  );

  // Restore Intensity to its default and regenerate a fresh program. Only valid
  // when stopped (the Reset control is hidden while playing). changeIntensity
  // updates the knob + engine; player.reset() re-arms (engine.reset() clears the
  // cumming latch and generation restarts at position 0).
  const reset = useCallback(() => {
    changeIntensity(DEFAULT_INTENSITY);
    whenCurrent(() => player.reset());
  }, [player, changeIntensity, whenCurrent]);

  const cumming = useCallback(() => {
    try {
      source.beginCumming();
      // Splice the wind-down now whenever Goon is the current source — including
      // while paused, so voice "cumming" mid-pause takes effect on resume rather
      // than being deferred behind the already-built lookahead.
      whenCurrent(() => player.invalidateFuture());
    } catch (err) {
      log(`error: ${(err as Error).message}`, "error");
    }
  }, [player, source, log, whenCurrent]);

  // Knobs and timeline transport are valid whenever Goon is the current source
  // (armed, playing or paused); cumming (the ending) whenever a device is
  // connected — in play or not.
  const canEnd = isCurrent && vacuglide.connected;

  // forward/back/finish/faster/slower are the Player's generic transport — Goon
  // only decides that it publishes them as words (Groove/Autopilot don't). The
  // words fire only while enabled (isCurrent), so they call the Player directly;
  // "finish" is the one Goon-specific target (the end of Goon's build).
  const keywords = useMemo<KeywordAction[]>(
    () => [
      ...stroke.keywords,
      { word: "more", enabled: isCurrent, run: () => stepIntensity(INTENSITY_STEP) },
      { word: "less", enabled: isCurrent, run: () => stepIntensity(-INTENSITY_STEP) },
      { word: "forward", enabled: isCurrent, run: () => player.forward() },
      { word: "back", enabled: isCurrent, run: () => player.back() },
      { word: "finish", enabled: isCurrent, run: () => player.seekTo(PROGRAM_MS) },
      { word: "faster", enabled: isCurrent, run: () => player.faster() },
      { word: "slower", enabled: isCurrent, run: () => player.slower() },
      { word: "cumming", enabled: canEnd, run: cumming },
    ],
    [stroke.keywords, isCurrent, canEnd, stepIntensity, cumming, player],
  );

  return {
    state,
    isCurrent,
    currentSpeed,
    programMs: PROGRAM_MS,
    start,
    stop,
    arm,
    reset,
    intensity,
    changeIntensity,
    cumming,
    canStroke: stroke.canStroke,
    canEnd,
    strokePulsing: stroke.strokePulsing,
    keywords,
  };
}

export type GoonController = ReturnType<typeof useGoon>;
