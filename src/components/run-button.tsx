"use client";

// The "play" button shown in each algorithm panel. When idle it starts the
// algorithm (stopping any other that's running); while running it becomes a
// Stop button. The device must be connected first (from the header).

export function RunButton({
  running,
  connected,
  onStart,
  onStop,
  className,
}: {
  running: boolean;
  connected: boolean;
  onStart: () => void;
  onStop: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={running ? onStop : onStart}
      disabled={!running && !connected}
      title={!running && !connected ? "Connect the device first" : undefined}
      className={`w-full rounded-lg py-3.5 text-lg font-bold text-white disabled:opacity-40 ${
        running ? "bg-red-600" : (className ?? "bg-blue-600")
      }`}
    >
      {running ? "Stop" : "Start"}
    </button>
  );
}
