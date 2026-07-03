"use client";

// Coordinates the (mutually exclusive) algorithms that can drive the device.
// Each algorithm hook produces an Algorithm; this runner knows which one is
// running, and starting one stops any other. Adding a new algorithm is just
// another entry in the array passed in — no other wiring changes.

import { useCallback } from "react";
import type { VacuglideController } from "@/hooks/use-vacuglide";

export interface Algorithm {
  id: string;
  label: string;
  isPlaying: boolean;
  currentSpeed: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useAlgorithmRunner(
  vacuglide: VacuglideController,
  algorithms: Algorithm[],
) {
  // Derived from the engines themselves (the source of truth), so it stays
  // correct even when an algorithm stops itself (e.g. finish, or page hide).
  const running = algorithms.find((algo) => algo.isPlaying) ?? null;

  const logError = useCallback(
    (err: unknown) => vacuglide.log(`error: ${(err as Error).message}`, "error"),
    [vacuglide],
  );

  // Stop whatever else is running, then start `id`. The device is connected
  // separately (from the header), so callers should ensure that first.
  const run = useCallback(
    async (id: string) => {
      try {
        for (const algo of algorithms) {
          if (algo.id !== id && algo.isPlaying) await algo.stop();
        }
        const target = algorithms.find((algo) => algo.id === id);
        if (target !== undefined && !target.isPlaying) await target.start();
      } catch (err) {
        logError(err);
      }
    },
    [algorithms, logError],
  );

  const stop = useCallback(() => {
    for (const algo of algorithms) {
      if (algo.isPlaying) algo.stop().catch(logError);
    }
  }, [algorithms, logError]);

  return { running, run, stop };
}

export type AlgorithmRunner = ReturnType<typeof useAlgorithmRunner>;
