"use client";

// The Autopilot algorithm as a React hook. It no longer owns a play loop — it
// drives the shared Player (in the device hook) with an Autopilot engine, and
// mirrors the player into render state while Autopilot is the active source. It
// still owns the algorithm's knobs (intensity, edge control, vacuum
// maintenance), which live only here and on the engine, not on the device API.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Autopilot,
  type EdgeControlLevel,
  type IntensityLevel,
  type SuctionControlLevel,
} from "@/lib/autopilot-engine";
import { UPCOMING_WINDOW_MS, type CurvePoint } from "@/components/sparkline";
import type { PlayerState } from "@/lib/program";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

// Intensity levels in segmented-bar order, so voice "more"/"less" can step to
// the next/previous one.
const INTENSITY_LEVELS: IntensityLevel[] = ["warmup", "low", "medium", "high"];

const FLAT: CurvePoint[] = [
  { t: 0, speed: 0 },
  { t: UPCOMING_WINDOW_MS, speed: 0 },
];

export function useAutopilot(vacuglide: VacuglideDeviceController) {
  const { player, log } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  // The hook owns the algorithm's levels; the engine is seeded from these on
  // construction and kept in sync by the change handlers below.
  const [isPlaying, setIsPlaying] = useState(false);
  const [state, setState] = useState<PlayerState>("armed");
  const [isCurrent, setIsCurrent] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [upcoming, setUpcoming] = useState<CurvePoint[]>(FLAT);
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

  // Mirror the player into render state, but only while Autopilot is the active
  // source (the shared player may be idle or running another algorithm).
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

  // Restore Intensity / Edge / Vacuum to their defaults and regenerate.
  const reset = useCallback(() => {
    setIntensity("warmup");
    source.setIntensity("warmup");
    setEdge("moderate");
    source.setEdgeControl("moderate");
    setSuction("more");
    source.setSuctionControl("more");
    if (player.source === source) player.reset();
  }, [player, source]);

  // engine.beginFinish() forces the engine's intensity/edge/suction fields (not
  // via the change* handlers below, which would double-invalidate) — mirror that
  // here so the segmented controls reflect it.
  const finishMe = useCallback(() => {
    try {
      source.beginFinish();
      // Splice the finish now whenever Autopilot is the current source —
      // including while paused, so voice "finish" mid-pause takes effect on
      // resume rather than being deferred behind the already-built lookahead.
      if (player.source === source) player.invalidateFuture();
    } catch (err) {
      log(`error: ${(err as Error).message}`, "error");
    }
    setIntensity("high");
    setEdge("moderate");
    setSuction("off");
  }, [player, source, log]);

  const changeIntensity = useCallback(
    (level: IntensityLevel) => {
      setIntensity(level);
      source.setIntensity(level);
      if (player.source === source) player.invalidateFuture();
      log(`intensity → ${level}`);
    },
    [player, source, log],
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
      if (player.source === source) player.invalidateFuture();
      log(`edge control → ${level}`);
    },
    [player, source, log],
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
  const keywords = useMemo<KeywordAction[]>(
    () => [
      ...stroke.keywords,
      { word: "finish", run: finishMe },
      { word: "more", run: () => stepIntensity(1) },
      { word: "less", run: () => stepIntensity(-1) },
      { word: "gentle", run: () => changeEdge("gentle") },
      { word: "moderate", run: () => changeEdge("moderate") },
      { word: "intense", run: () => changeEdge("intense") },
      { word: "off", run: () => changeSuction("off") },
      { word: "light", run: () => changeSuction("little") },
      { word: "heavy", run: () => changeSuction("more") },
    ],
    [stroke.keywords, finishMe, stepIntensity, changeEdge, changeSuction],
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
    finishMe,
    intensity,
    changeIntensity,
    edge,
    changeEdge,
    suction,
    changeSuction,
    strokePulsing: stroke.strokePulsing,
    keywords,
  };
}

export type AutopilotController = ReturnType<typeof useAutopilot>;
