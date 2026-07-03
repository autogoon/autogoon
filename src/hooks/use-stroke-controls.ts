"use client";

// Shared "Stroke" controls: voice "up"/"down" opens the stroke+/stroke- valve
// for a beat then closes it, mimicking a manual tap. Lives here (rather than
// inside one algorithm) so every algorithm panel can offer the same Stroke
// controls without duplicating the pulse logic — it drives the valves
// directly through the VacuglideDeviceController, independent of whichever
// algorithm is currently running.

import { useCallback, useMemo, useState } from "react";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

const STROKE_PULSE_MS = 400;

export function useStrokeControls(vacuglide: VacuglideDeviceController) {
  const { valvePlus, valveMinus, log } = vacuglide;

  // Which valve a voice pulse is currently holding open, so the matching
  // manual-override button can highlight while it happens.
  const [strokePulsing, setStrokePulsing] = useState<"plus" | "minus" | null>(
    null,
  );

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

  const keywords = useMemo<KeywordAction[]>(
    () => [
      { word: "up", run: () => strokePulse("plus") },
      { word: "down", run: () => strokePulse("minus") },
    ],
    [strokePulse],
  );

  return { strokePulsing, keywords };
}

export type StrokeControls = ReturnType<typeof useStrokeControls>;
