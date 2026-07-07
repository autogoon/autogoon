"use client";

// The Autopilot algorithm as a React hook. Owns the engine and its knobs
// (intensity, edge control, vacuum maintenance) — none of which exist on the
// device API. It drives the device purely through the VacuglideDeviceController it
// is given, so a different algorithm can reuse the same device layer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Autopilot,
  type EdgeControlLevel,
  type IntensityLevel,
  type SuctionControlLevel,
} from "@/lib/autopilot-engine";
import {
  UPCOMING_WINDOW_MS,
  type CurvePoint,
} from "@/components/sparkline";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

// Intensity levels in segmented-bar order, so voice "more"/"less" can step to
// the next/previous one.
const INTENSITY_LEVELS: IntensityLevel[] = ["warmup", "low", "medium", "high"];

export function useAutopilot(vacuglide: VacuglideDeviceController) {
  const { getDevice, log } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  // The hook owns the algorithm's levels; the engine is seeded from these on
  // construction and kept in sync by the change handlers below.
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  // The next minute of script, refreshed every tick for the sparkline preview.
  const [upcoming, setUpcoming] = useState<CurvePoint[]>([]);
  const [intensity, setIntensity] = useState<IntensityLevel>("warmup");
  const [edge, setEdge] = useState<EdgeControlLevel>("moderate");
  const [suction, setSuction] = useState<SuctionControlLevel>("more");

  const engineRef = useRef<Autopilot | null>(null);
  engineRef.current ??= new Autopilot({
    getDevice,
    log,
    intensity,
    edgeControl: edge,
    suctionControl: suction,
  });
  const engine = engineRef.current;

  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      const state = engine.getState();
      setIsPlaying(state.isPlaying);
      setCurrentSpeed(state.currentSpeed);
      setUpcoming(engine.getUpcomingCurve(UPCOMING_WINDOW_MS));
    });
    return unsubscribe;
  }, [engine]);

  // Safety: if the page is closed while autopilot is running, ask the device
  // to stop rather than leaving it at the last commanded speed.
  useEffect(() => {
    const onPageHide = () => {
      const device = getDevice();
      if (device !== null && device.cluster !== null && engine.isPlaying) {
        void fetch(`${device.cluster}/vacuglide/target-speed/stop`, {
          method: "PUT",
          headers: { "x-device-token": device.token },
          keepalive: true,
        }).catch(() => undefined);
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [engine, getDevice]);

  const start = useCallback(() => engine.start(), [engine]);
  const stop = useCallback(() => engine.stop(), [engine]);

  // engine.finishMe() sets its intensity/edge/suction fields directly (not via
  // the change* handlers below, which would regenerate the script) — mirror
  // that here so the segmented controls reflect it.
  const finishMe = useCallback(() => {
    engine.finishMe().catch((err: Error) => {
      log(`error: ${err.message}`, "error");
    });
    setIntensity("high");
    setEdge("moderate");
    setSuction("off");
  }, [engine, log]);

  const changeIntensity = useCallback(
    (level: IntensityLevel) => {
      setIntensity(level);
      engine.setIntensity(level);
      log(`intensity → ${level}`);
    },
    [engine, log],
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
      engine.setEdgeControl(level);
      log(`edge control → ${level}`);
    },
    [engine, log],
  );

  const changeSuction = useCallback(
    (level: SuctionControlLevel) => {
      setSuction(level);
      engine.setSuctionControl(level);
      log(`vacuum maintenance → ${level}`);
    },
    [engine, log],
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
    currentSpeed,
    upcoming,
    start,
    stop,
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
