"use client";

// The Homegrown Autopilot algorithm as a React hook. Mirrors useVacuglideAutopilot: it owns the
// engine and drives the device through the VacuglideDeviceController it is given, so
// both algorithms share the same device layer. Still boilerplate for now.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HomegrownAutopilot } from "@/lib/homegrown-autopilot-engine";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

export function useHomegrownAutopilot(vacuglide: VacuglideDeviceController) {
  const { getDevice } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  // The Speed slider: raw script speeds are scaled by this percentage before
  // being sent to the device.
  const [speedPercent, setSpeedPercent] = useState(10);

  const engineRef = useRef<HomegrownAutopilot | null>(null);
  engineRef.current ??= new HomegrownAutopilot({ getDevice, speedPercent });
  const engine = engineRef.current;

  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      const state = engine.getState();
      setIsPlaying(state.isPlaying);
      setCurrentSpeed(state.currentSpeed);
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

  // Stroke's up/down come from the shared useStrokeControls.
  const keywords = useMemo<KeywordAction[]>(
    () => [
      ...stroke.keywords,
      { word: "faster", run: () => stepSpeedPercent(10) },
      { word: "slower", run: () => stepSpeedPercent(-10) },
    ],
    [stroke.keywords, stepSpeedPercent],
  );

  return {
    isPlaying,
    currentSpeed,
    start,
    stop,
    speedPercent,
    changeSpeedPercent,
    strokePulsing: stroke.strokePulsing,
    keywords,
  };
}

export type HomegrownAutopilotController = ReturnType<typeof useHomegrownAutopilot>;
