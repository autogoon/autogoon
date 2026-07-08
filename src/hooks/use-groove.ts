"use client";

// The Groove algorithm as a React hook. It owns only Groove's knobs (Speed +
// Variability) and keyword vocabulary; it reads the shared player view (from
// usePlayer) to know whether it is the active source, and no longer mirrors
// player state itself.

import { useCallback, useMemo, useRef, useState } from "react";
import { Groove, type VariabilityLevel } from "@/lib/groove-engine";
import { useAlgorithmSource } from "@/hooks/use-algorithm-source";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import type { PlayerView } from "@/hooks/use-player";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

export function useGroove(
  vacuglide: VacuglideDeviceController,
  view: PlayerView,
) {
  const { player, log } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  const [speedPercent, setSpeedPercent] = useState(10);
  const [variability, setVariability] = useState<VariabilityLevel>("low");

  const sourceRef = useRef<Groove | null>(null);
  sourceRef.current ??= new Groove({
    speedPercent: 10,
    variability: "low",
  });
  const source = sourceRef.current;

  const { isCurrent, state, currentSpeed, start, stop, arm, whenCurrent } =
    useAlgorithmSource(vacuglide, source, view);

  // Restore Speed + Variability to their defaults and regenerate.
  const reset = useCallback(() => {
    setSpeedPercent(10);
    source.setSpeedPercent(10);
    setVariability("low");
    source.setVariability("low");
    whenCurrent(() => player.reset());
  }, [player, source, whenCurrent]);

  const changeSpeedPercent = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      setSpeedPercent(clamped);
      source.setSpeedPercent(clamped);
      whenCurrent(() => player.refresh());
    },
    [player, source, whenCurrent],
  );

  const stepSpeedPercent = useCallback(
    (delta: number) => {
      changeSpeedPercent(Math.max(0, Math.min(100, speedPercent + delta)));
    },
    [speedPercent, changeSpeedPercent],
  );

  const changeVariability = useCallback(
    (level: VariabilityLevel) => {
      setVariability(level);
      source.setVariability(level);
      whenCurrent(() => player.invalidateFuture());
    },
    [player, source, whenCurrent],
  );

  const cumming = useCallback(() => {
    try {
      source.beginCumming();
      // Splice the wind-down now whenever Groove is the current source —
      // including while paused, so voice "cumming" mid-pause takes effect on
      // resume rather than being deferred behind the already-built lookahead.
      whenCurrent(() => player.invalidateFuture());
    } catch (err) {
      log(`error: ${(err as Error).message}`, "error");
    }
  }, [player, source, log, whenCurrent]);

  // Speed/variability knobs are valid whenever Groove is the current source
  // (armed, playing or paused); cumming (the ending) whenever a device is
  // connected — in play or not.
  const canEnd = isCurrent && vacuglide.connected;

  const keywords = useMemo<KeywordAction[]>(
    () => [
      ...stroke.keywords,
      { word: "faster", enabled: isCurrent, run: () => stepSpeedPercent(5) },
      { word: "slower", enabled: isCurrent, run: () => stepSpeedPercent(-5) },
      { word: "off", enabled: isCurrent, run: () => changeVariability("off") },
      { word: "low", enabled: isCurrent, run: () => changeVariability("low") },
      { word: "medium", enabled: isCurrent, run: () => changeVariability("medium") },
      { word: "high", enabled: isCurrent, run: () => changeVariability("high") },
      { word: "cumming", enabled: canEnd, run: cumming },
    ],
    [stroke.keywords, isCurrent, canEnd, stepSpeedPercent, changeVariability, cumming],
  );

  return {
    state,
    isCurrent,
    currentSpeed,
    start,
    stop,
    arm,
    reset,
    speedPercent,
    changeSpeedPercent,
    variability,
    changeVariability,
    cumming,
    canStroke: stroke.canStroke,
    canEnd,
    strokePulsing: stroke.strokePulsing,
    keywords,
  };
}

export type GrooveController = ReturnType<typeof useGroove>;
