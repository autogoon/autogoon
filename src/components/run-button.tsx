"use client";

// The transport control shown at the top of each algorithm panel. Driven by the
// Player's state: while playing it's a single Stop; while armed or paused it's
// Start + Reset side by side. Start needs the device connected first.

import type { PlayerState } from "@/lib/program";
import { Button } from "@/components/button";

export function RunButton({
  state,
  connected,
  onStart,
  onStop,
  onReset,
  className,
}: {
  state: PlayerState;
  connected: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  className?: string;
}) {
  if (state === "playing") {
    return (
      <Button
        onClick={onStop}
        className="w-full rounded-lg bg-red-600 py-3.5 text-lg font-bold text-white"
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
        className={`flex-1 rounded-lg py-3.5 text-lg font-bold text-white disabled:opacity-40 ${
          className ?? "bg-blue-600"
        }`}
        badge="start"
      >
        Start
      </Button>
      <Button
        onClick={onReset}
        className="bg-secondary rounded-lg px-6 py-3.5 text-lg font-bold disabled:opacity-40"
        badge="reset"
      >
        Reset
      </Button>
    </div>
  );
}
