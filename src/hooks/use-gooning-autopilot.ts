"use client";

// The Gooning algorithm as a React hook. Mirrors useHomegrownAutopilot: owns the
// engine, mirrors it into render state, wires the voice keywords and the pagehide
// safety-stop, and drives the device through the shared VacuglideDeviceController.
// Speed and Variability are automatic (engine-driven); the only manual knob is
// Intensity (default 60), plus the timeline jump commands.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GooningAutopilot } from "@/lib/gooning-autopilot-engine";
import { UPCOMING_WINDOW_MS, type CurvePoint } from "@/components/sparkline";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

const DEFAULT_INTENSITY = 50;
const INTENSITY_STEP = 10;

export function useGooningAutopilot(vacuglide: VacuglideDeviceController) {
  const { getDevice, log } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [upcoming, setUpcoming] = useState<CurvePoint[]>([]);
  const [positionMs, setPositionMs] = useState(0);
  const [programMs, setProgramMs] = useState(0);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);

  const engineRef = useRef<GooningAutopilot | null>(null);
  engineRef.current ??= new GooningAutopilot({
    getDevice,
    intensity: DEFAULT_INTENSITY,
  });
  const engine = engineRef.current;

  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      const state = engine.getState();
      setIsPlaying(state.isPlaying);
      setCurrentSpeed(state.currentSpeed);
      setPositionMs(state.positionMs);
      setProgramMs(state.programMs);
      setUpcoming(engine.getUpcomingCurve(UPCOMING_WINDOW_MS));
    });
    return unsubscribe;
  }, [engine]);

  // Safety: stop the device if the page is closed while running.
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

  const changeIntensity = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      setIntensity(clamped);
      engine.setIntensity(clamped);
    },
    [engine],
  );

  const stepIntensity = useCallback(
    (delta: number) => changeIntensity(intensity + delta),
    [intensity, changeIntensity],
  );

  const forward = useCallback(() => engine.forward(), [engine]);
  const back = useCallback(() => engine.back(), [engine]);
  const finish = useCallback(() => engine.finish(), [engine]);

  const cumming = useCallback(() => {
    try {
      engine.cumming();
    } catch (err) {
      log(`error: ${(err as Error).message}`, "error");
    }
  }, [engine, log]);

  const keywords = useMemo<KeywordAction[]>(
    () => [
      ...stroke.keywords,
      { word: "more", run: () => stepIntensity(INTENSITY_STEP) },
      { word: "less", run: () => stepIntensity(-INTENSITY_STEP) },
      { word: "forward", run: forward },
      { word: "back", run: back },
      { word: "finish", run: finish },
      { word: "cumming", run: cumming },
    ],
    [stroke.keywords, stepIntensity, forward, back, finish, cumming],
  );

  return {
    isPlaying,
    currentSpeed,
    upcoming,
    positionMs,
    programMs,
    start,
    stop,
    intensity,
    changeIntensity,
    forward,
    back,
    finish,
    cumming,
    strokePulsing: stroke.strokePulsing,
    keywords,
  };
}

export type GooningAutopilotController = ReturnType<typeof useGooningAutopilot>;
