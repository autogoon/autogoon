"use client";

// The Homegrown Autopilot algorithm as a React hook. Mirrors useVacuglideAutopilot: it owns the
// engine and drives the device through the VacuglideDeviceController it is given, so
// both algorithms share the same device layer. Still boilerplate for now.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HomegrownAutopilot,
  type VariabilityLevel,
} from "@/lib/homegrown-autopilot-engine";
import {
  UPCOMING_WINDOW_MS,
  type CurvePoint,
} from "@/components/sparkline";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

export function useHomegrownAutopilot(vacuglide: VacuglideDeviceController) {
  const { getDevice, log } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  // The next minute of script, refreshed every tick for the sparkline preview.
  const [upcoming, setUpcoming] = useState<CurvePoint[]>([]);
  // The Speed slider: raw script speeds are scaled by this percentage before
  // being sent to the device.
  const [speedPercent, setSpeedPercent] = useState(10);
  // How randomised each ramp's timing is (see the engine for the percentages).
  const [variability, setVariability] = useState<VariabilityLevel>("low");

  const engineRef = useRef<HomegrownAutopilot | null>(null);
  engineRef.current ??= new HomegrownAutopilot({
    getDevice,
    speedPercent,
    variability,
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

  // Safety: if the page is closed while running, ask the device to stop rather
  // than leaving it at the last commanded speed.
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
  const stop = useCallback(() => engine.pause(), [engine]);

  const changeSpeedPercent = useCallback(
    (percent: number) => {
      setSpeedPercent(percent);
      engine.setSpeedPercent(percent);
    },
    [engine],
  );

  // Step the Speed slider by delta percentage points, clamped to 0-100.
  const stepSpeedPercent = useCallback(
    (delta: number) => {
      changeSpeedPercent(Math.max(0, Math.min(100, speedPercent + delta)));
    },
    [speedPercent, changeSpeedPercent],
  );

  const changeVariability = useCallback(
    (level: VariabilityLevel) => {
      setVariability(level);
      engine.setVariability(level);
    },
    [engine],
  );

  const cumming = useCallback(() => {
    try {
      engine.cumming();
    } catch (err) {
      log(`error: ${(err as Error).message}`, "error");
    }
  }, [engine, log]);

  // Stroke's up/down come from the shared useStrokeControls.
  const keywords = useMemo<KeywordAction[]>(
    () => [
      ...stroke.keywords,
      { word: "faster", run: () => stepSpeedPercent(10) },
      { word: "slower", run: () => stepSpeedPercent(-10) },
      { word: "off", run: () => changeVariability("off") },
      { word: "low", run: () => changeVariability("low") },
      { word: "medium", run: () => changeVariability("medium") },
      { word: "high", run: () => changeVariability("high") },
      { word: "cumming", run: cumming },
    ],
    [stroke.keywords, stepSpeedPercent, changeVariability, cumming],
  );

  return {
    isPlaying,
    currentSpeed,
    upcoming,
    start,
    stop,
    speedPercent,
    changeSpeedPercent,
    variability,
    changeVariability,
    cumming,
    strokePulsing: stroke.strokePulsing,
    keywords,
  };
}

export type HomegrownAutopilotController = ReturnType<typeof useHomegrownAutopilot>;
