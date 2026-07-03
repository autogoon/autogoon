"use client";

// The Autopilot algorithm as a React hook. Owns the engine and its knobs
// (intensity, edge control, vacuum maintenance) — none of which exist on the
// device API. It drives the device purely through the VacuglideController it
// is given, so a different algorithm can reuse the same device layer.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Autopilot,
  type EdgeControlLevel,
  type IntensityLevel,
  type SuctionControlLevel,
} from "@/lib/autopilot-engine";
import type { VacuglideController } from "@/hooks/use-vacuglide";

export function useAutopilot(vacuglide: VacuglideController) {
  const { getDevice, log } = vacuglide;

  // The hook owns the algorithm's levels; the engine is seeded from these on
  // construction and kept in sync by the change handlers below.
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
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
  };
}

export type AutopilotController = ReturnType<typeof useAutopilot>;
