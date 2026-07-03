"use client";

// The Vacuglide Autopilot algorithm as a React hook. Owns the engine and its knobs
// (intensity, edge control, vacuum maintenance) — none of which exist on the
// device API. It drives the device purely through the VacuglideDeviceController it
// is given, so a different algorithm can reuse the same device layer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  VacuglideAutopilot,
  type EdgeControlLevel,
  type IntensityLevel,
  type SuctionControlLevel,
} from "@/lib/vacuglide-autopilot-engine";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

// A voice "Up"/"Down" opens a valve for a beat then closes it, mimicking a
// quick manual stroke tap.
const STROKE_PULSE_MS = 400;

export function useVacuglideAutopilot(vacuglide: VacuglideDeviceController) {
  const { getDevice, log, valvePlus, valveMinus } = vacuglide;

  // The hook owns the algorithm's levels; the engine is seeded from these on
  // construction and kept in sync by the change handlers below.
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [intensity, setIntensity] = useState<IntensityLevel>("warmup");
  const [edge, setEdge] = useState<EdgeControlLevel>("moderate");
  const [suction, setSuction] = useState<SuctionControlLevel>("more");

  const engineRef = useRef<VacuglideAutopilot | null>(null);
  engineRef.current ??= new VacuglideAutopilot({
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

  const finishMe = useCallback(() => {
    engine.finishMe().catch((err: Error) => {
      log(`error: ${err.message}`, "error");
    });
  }, [engine, log]);

  const changeIntensity = useCallback(
    (level: IntensityLevel) => {
      setIntensity(level);
      engine.setIntensity(level);
      log(`intensity → ${level}`);
    },
    [engine, log],
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

  // Which valve a voice pulse is currently holding open, so the matching
  // manual-override button can highlight while it happens.
  const [strokePulsing, setStrokePulsing] = useState<"plus" | "minus" | null>(
    null,
  );

  // Open a valve, then close it after a short beat — a voice-driven stroke tap.
  const strokePulse = useCallback(
    (dir: "plus" | "minus") => {
      const valve = dir === "plus" ? valvePlus : valveMinus;
      const clear = () =>
        setStrokePulsing((cur) => (cur === dir ? null : cur));
      setStrokePulsing(dir);
      valve(true)
        .then(() => {
          setTimeout(() => {
            valve(false).catch((err: Error) =>
              log(`error: ${err.message}`, "error"),
            );
            clear();
          }, STROKE_PULSE_MS);
        })
        .catch((err: Error) => {
          log(`error: ${err.message}`, "error");
          clear();
        });
    },
    [valvePlus, valveMinus, log],
  );

  // The words this algorithm understands and what each one does. start/stop are
  // universal (handled by the dispatcher via the runner) so they're not here.
  const keywords = useMemo<KeywordAction[]>(
    () => [
      { word: "up", run: () => strokePulse("plus") },
      { word: "down", run: () => strokePulse("minus") },
      { word: "finish", run: finishMe },
      { word: "warmup", run: () => changeIntensity("warmup") },
      { word: "low", run: () => changeIntensity("low") },
      { word: "medium", run: () => changeIntensity("medium") },
      { word: "high", run: () => changeIntensity("high") },
      { word: "gentle", run: () => changeEdge("gentle") },
      { word: "moderate", run: () => changeEdge("moderate") },
      { word: "intense", run: () => changeEdge("intense") },
      { word: "dry", run: () => changeSuction("off") },
      { word: "damp", run: () => changeSuction("little") },
      { word: "wet", run: () => changeSuction("more") },
    ],
    [strokePulse, finishMe, changeIntensity, changeEdge, changeSuction],
  );

  return {
    isPlaying,
    currentSpeed,
    start,
    stop,
    finishMe,
    intensity,
    changeIntensity,
    edge,
    changeEdge,
    suction,
    changeSuction,
    strokePulsing,
    keywords,
  };
}

export type VacuglideAutopilotController = ReturnType<typeof useVacuglideAutopilot>;
