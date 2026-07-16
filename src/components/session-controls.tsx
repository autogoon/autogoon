"use client";

// The session controls shown at the top of each algorithm panel — Start / Stop /
// Reset. Driven by the Player's state: while playing it's a single Stop; while
// armed or paused it's Start + Reset side by side. Start needs the device
// connected first.

import type { PlayerState } from "@/lib/program";
import { Button } from "@/components/button";

export function SessionControls({
  state,
  connected,
  onStart,
  onStop,
  onReset,
  stopDisabled = false,
  stopDisabledTitle,
}: {
  state: PlayerState;
  connected: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  // An algorithm can withdraw Stop (e.g. an after-play outcome that ignores
  // it); the safe word remains the way out.
  stopDisabled?: boolean;
  stopDisabledTitle?: string;
}) {
  if (state === "playing") {
    return (
      <Button
        onClick={onStop}
        disabled={stopDisabled}
        title={stopDisabled ? stopDisabledTitle : undefined}
        className="w-full rounded-lg bg-red-600 py-3.5 text-lg font-bold text-white disabled:opacity-50"
        badge="stop"
      >
        Stop
      </Button>
    );
  }

  return (
    <div className="flex gap-3">
      <Button
        onClick={onStart}
        disabled={!connected}
        title={!connected ? "Connect the device first" : undefined}
        className="flex-1 rounded-lg bg-blue-600 py-3.5 text-lg font-bold text-white disabled:opacity-50"
        badge="start"
      >
        Start
      </Button>
      <Button
        onClick={onReset}
        className="bg-secondary rounded-lg px-6 py-3.5 text-lg font-bold"
        badge="reset"
      >
        Reset
      </Button>
    </div>
  );
}
