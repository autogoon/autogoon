"use client";

// Shared "Stroke" controls: voice "up"/"down" opens the stroke+/stroke- valve
// for a beat then closes it, mimicking a manual tap. Lives here (rather than
// inside one algorithm) so every algorithm panel can offer the same Stroke
// controls without duplicating the pulse logic — it drives the valves
// directly through the VacuglideDeviceController, independent of whichever
// algorithm is currently running.

import { useCallback, useMemo, useState } from "react";
import type { Command } from "@/hooks/use-voice-commands";
import type { PlayerView } from "@/hooks/use-player";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

const STROKE_PULSE_MINUS_MS = 4000;
const STROKE_PULSE_PLUS_MS = 400;

export function useStrokeControls(
  vacuglide: VacuglideDeviceController,
  player: PlayerView,
) {
  const { valvePlus, valveMinus, log, connected } = vacuglide;

  // Which valve a voice pulse is currently holding open, so the matching
  // manual-override button can highlight while it happens.
  const [strokePulsing, setStrokePulsing] = useState<"plus" | "minus" | null>(
    null,
  );

  // A pulse is scheduled as a whole up front: open now, close in the pulse
  // length (real milliseconds — while a program plays both land in it as
  // program events, undilated by the playback rate; see valvePlus/valveMinus).
  // The highlight clear is purely cosmetic, so a plain timer is fine for it.
  const strokePulse = useCallback(
    (dir: "plus" | "minus") => {
      const valve = dir === "plus" ? valvePlus : valveMinus;
      const ms = dir === "minus" ? STROKE_PULSE_MINUS_MS : STROKE_PULSE_PLUS_MS;
      const onError = (err: Error) => log(`error: ${err.message}`, "error");
      setStrokePulsing(dir);
      valve(true).catch(onError);
      valve(false, ms).catch(onError);
      setTimeout(
        () => setStrokePulsing((cur) => (cur === dir ? null : cur)),
        ms,
      );
    },
    [valvePlus, valveMinus, log],
  );

  // Manual stroke needs a connected device — regardless of play state — and
  // yields to a scheduled stroke: while an engine-generated stroke is holding
  // a valve open, the manual controls are out (ruin/torture endings depend on
  // their schedule playing out untouched). This one flag is the source of
  // truth for both the voice words below and the Stroke buttons' enabled state.
  const canStroke = connected && !player.strokeBusy;

  const keywords = useMemo<Command[]>(
    () => [
      { word: "up", enabled: canStroke, run: () => strokePulse("plus") },
      { word: "down", enabled: canStroke, run: () => strokePulse("minus") },
    ],
    [strokePulse, canStroke],
  );

  return { strokePulsing, canStroke, keywords };
}

export type StrokeControls = ReturnType<typeof useStrokeControls>;
