"use client";

// The Autopilot algorithm as a React hook. It owns only Autopilot's knobs
// (intensity, edge control, vacuum maintenance) and keyword vocabulary; it reads
// the shared player view (from usePlayer) to know whether it is the active
// source, and no longer mirrors player state itself.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Autopilot,
  type EdgeControlLevel,
  type IntensityLevel,
  type SuctionControlLevel,
} from "@/lib/autopilot-engine";
import { useAlgorithmSource } from "@/hooks/use-algorithm-source";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import type { PlayerView } from "@/hooks/use-player";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

// Intensity levels in segmented-bar order, so voice "more"/"less" can step to
// the next/previous one.
const INTENSITY_LEVELS: IntensityLevel[] = ["warmup", "low", "medium", "high"];

export function useAutopilot(
  vacuglide: VacuglideDeviceController,
  view: PlayerView,
) {
  const { player, log } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  // The hook owns the algorithm's levels; the engine is seeded from these on
  // construction and kept in sync by the change handlers below.
  const [intensity, setIntensity] = useState<IntensityLevel>("warmup");
  const [edge, setEdge] = useState<EdgeControlLevel>("moderate");
  const [suction, setSuction] = useState<SuctionControlLevel>("more");

  const sourceRef = useRef<Autopilot | null>(null);
  sourceRef.current ??= new Autopilot({
    intensity: "warmup",
    edgeControl: "moderate",
    suctionControl: "more",
  });
  const source = sourceRef.current;

  const { isCurrent, state, currentSpeed, start, stop, arm, whenCurrent } =
    useAlgorithmSource(vacuglide, source, view);

  // Restore Intensity / Edge / Vacuum to their defaults and regenerate.
  const reset = useCallback(() => {
    setIntensity("warmup");
    source.setIntensity("warmup");
    setEdge("moderate");
    source.setEdgeControl("moderate");
    setSuction("more");
    source.setSuctionControl("more");
    whenCurrent(() => player.reset());
  }, [player, source, whenCurrent]);

  // engine.beginFinish() forces the engine's intensity/edge/suction fields (not
  // via the change* handlers below, which would double-invalidate) — mirror that
  // here so the segmented controls reflect it.
  const finishMe = useCallback(() => {
    try {
      source.beginFinish();
      // Splice the finish now whenever Autopilot is the current source —
      // including while paused, so voice "finish" mid-pause takes effect on
      // resume rather than being deferred behind the already-built lookahead.
      whenCurrent(() => player.invalidateFuture());
    } catch (err) {
      log(`error: ${(err as Error).message}`, "error");
    }
    setIntensity("high");
    setEdge("moderate");
    setSuction("off");
  }, [player, source, log, whenCurrent]);

  const changeIntensity = useCallback(
    (level: IntensityLevel) => {
      setIntensity(level);
      source.setIntensity(level);
      whenCurrent(() => player.invalidateFuture());
      log(`intensity → ${level}`);
    },
    [player, source, log, whenCurrent],
  );

  // Step intensity to the next/previous level in bar order, clamped at the ends.
  const stepIntensity = useCallback(
    (delta: number) => {
      const idx = INTENSITY_LEVELS.indexOf(intensity);
      const next =
        INTENSITY_LEVELS[
          Math.max(0, Math.min(INTENSITY_LEVELS.length - 1, idx + delta))
        ];
      if (next !== undefined) changeIntensity(next);
    },
    [intensity, changeIntensity],
  );

  const changeEdge = useCallback(
    (level: EdgeControlLevel) => {
      setEdge(level);
      source.setEdgeControl(level);
      whenCurrent(() => player.invalidateFuture());
      log(`edge control → ${level}`);
    },
    [player, source, log, whenCurrent],
  );

  // Suction changes only the vacuum pulses, which the engine bakes into the
  // program as it extends — no invalidate, so already-scheduled pulses persist.
  const changeSuction = useCallback(
    (level: SuctionControlLevel) => {
      setSuction(level);
      source.setSuctionControl(level);
      log(`vacuum maintenance → ${level}`);
    },
    [source, log],
  );

  // The words this algorithm understands and what each one does. start/stop are
  // universal (handled by the dispatcher via the runner) so they're not here.
  // Stroke's up/down come from the shared useStrokeControls.
  // Knobs are valid whenever Autopilot is the current source (armed, playing or
  // paused); finish (the crescendo ending) whenever a device is connected — in
  // play or not.
  const canEnd = isCurrent && vacuglide.connected;

  const keywords = useMemo<KeywordAction[]>(
    () => [
      ...stroke.keywords,
      { word: "finish", enabled: canEnd, run: finishMe },
      { word: "more", enabled: isCurrent, run: () => stepIntensity(1) },
      { word: "less", enabled: isCurrent, run: () => stepIntensity(-1) },
      { word: "gentle", enabled: isCurrent, run: () => changeEdge("gentle") },
      { word: "moderate", enabled: isCurrent, run: () => changeEdge("moderate") },
      { word: "intense", enabled: isCurrent, run: () => changeEdge("intense") },
      { word: "off", enabled: isCurrent, run: () => changeSuction("off") },
      { word: "light", enabled: isCurrent, run: () => changeSuction("little") },
      { word: "heavy", enabled: isCurrent, run: () => changeSuction("more") },
    ],
    [stroke.keywords, isCurrent, canEnd, finishMe, stepIntensity, changeEdge, changeSuction],
  );

  return {
    state,
    isCurrent,
    currentSpeed,
    start,
    stop,
    arm,
    reset,
    finishMe,
    intensity,
    changeIntensity,
    edge,
    changeEdge,
    suction,
    changeSuction,
    canStroke: stroke.canStroke,
    canEnd,
    strokePulsing: stroke.strokePulsing,
    keywords,
  };
}

export type AutopilotController = ReturnType<typeof useAutopilot>;
