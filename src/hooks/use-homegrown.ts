"use client";

// The Homegrown algorithm as a React hook. Mirrors useAutopilot: it owns the
// engine and drives the device through the VacuglideController it is given, so
// both algorithms share the same device layer. Still boilerplate for now.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Homegrown } from "@/lib/homegrown-engine";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import type { VacuglideController } from "@/hooks/use-vacuglide";

export function useHomegrown(vacuglide: VacuglideController) {
  const { getDevice, log } = vacuglide;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);

  const engineRef = useRef<Homegrown | null>(null);
  engineRef.current ??= new Homegrown({ getDevice, log });
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

  // Only start/stop for now (both universal), so no algorithm-specific words.
  const keywords = useMemo<KeywordAction[]>(() => [], []);

  return {
    isPlaying,
    currentSpeed,
    start,
    stop,
    keywords,
  };
}

export type HomegrownController = ReturnType<typeof useHomegrown>;
