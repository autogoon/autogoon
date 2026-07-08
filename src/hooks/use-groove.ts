"use client";

// The Groove algorithm as a React hook. It no longer owns a play loop —
// it drives the shared Player (in the device hook) with a Groove, and
// mirrors the player into render state while Groove is the active source.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Groove, type VariabilityLevel } from "@/lib/groove-engine";
import type { PlayerState } from "@/lib/program";
import { UPCOMING_WINDOW_MS, type CurvePoint } from "@/components/sparkline";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

const FLAT: CurvePoint[] = [
  { t: 0, speed: 0 },
  { t: UPCOMING_WINDOW_MS, speed: 0 },
];

export function useGroove(vacuglide: VacuglideDeviceController) {
  const { player, log } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  const [isPlaying, setIsPlaying] = useState(false);
  const [state, setState] = useState<PlayerState>("armed");
  const [isCurrent, setIsCurrent] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [upcoming, setUpcoming] = useState<CurvePoint[]>(FLAT);
  const [speedPercent, setSpeedPercent] = useState(10);
  const [variability, setVariability] = useState<VariabilityLevel>("low");

  const sourceRef = useRef<Groove | null>(null);
  sourceRef.current ??= new Groove({
    speedPercent: 10,
    variability: "low",
  });
  const source = sourceRef.current;

  // Mirror the player into render state, but only while Groove is the active
  // source (the shared player may be idle or, later, running another algorithm).
  useEffect(() => {
    const sync = () => {
      const current = player.source === source;
      const st = player.getState();
      const playing = current && st.state === "playing";
      setIsCurrent(current);
      setState(current ? st.state : "armed");
      setIsPlaying(playing);
      setCurrentSpeed(playing ? st.currentSpeed : 0);
      setUpcoming(
        current ? player.upcomingWindow(UPCOMING_WINDOW_MS).speed : FLAT,
      );
    };
    const unsubscribe = player.subscribe(sync);
    sync();
    return unsubscribe;
  }, [player, source]);

  const start = useCallback(async () => {
    if (player.source !== source) player.arm(source);
    player.play();
  }, [player, source]);

  const stop = useCallback(() => player.pause(), [player]);

  const arm = useCallback(() => {
    if (player.source !== source) player.arm(source);
  }, [player, source]);

  // Restore Speed + Variability to their defaults and regenerate.
  const reset = useCallback(() => {
    setSpeedPercent(10);
    source.setSpeedPercent(10);
    setVariability("low");
    source.setVariability("low");
    if (player.source === source) player.reset();
  }, [player, source]);

  const changeSpeedPercent = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      setSpeedPercent(clamped);
      source.setSpeedPercent(clamped);
      if (player.source === source) player.refresh();
    },
    [player, source],
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
      if (player.source === source) player.invalidateFuture();
    },
    [player, source],
  );

  const cumming = useCallback(() => {
    try {
      source.beginCumming();
      // Splice the wind-down now whenever Groove is the current source —
      // including while paused, so voice "cumming" mid-pause takes effect on
      // resume rather than being deferred behind the already-built lookahead.
      if (player.source === source) player.invalidateFuture();
    } catch (err) {
      log(`error: ${(err as Error).message}`, "error");
    }
  }, [player, source, log]);

  // Speed/variability knobs are valid whenever Groove is the current source
  // (armed, playing or paused); cumming (the ending) only during a session.
  const canEnd = state !== "armed";

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
    isPlaying,
    state,
    isCurrent,
    currentSpeed,
    upcoming,
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
