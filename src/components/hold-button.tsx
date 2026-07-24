"use client";

// A press-and-hold button: opens a valve on press, closes on release. Used for
// the manual stroke overrides. The valve stays open a minimum of 300ms even on
// a quick tap, mirroring the original's useMinPressDuration hook.

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/button";

const MIN_PRESS_MS = 300;

export function HoldButton({
  label,
  disabled,
  onValve,
  onError,
  forcedActive = false,
  voiceCommand,
}: {
  label: string;
  disabled: boolean;
  onValve: (state: boolean) => Promise<unknown>;
  onError: (message: string) => void;
  // Highlight the button even without a pointer press — e.g. a voice pulse
  // driving the same valve.
  forcedActive?: boolean;
  // The voice command that pulses this valve, shown as a voiceCommand.
  voiceCommand?: string;
}) {
  const [active, setActive] = useState(false);
  const pressedAtRef = useRef(0);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  // The valve command logs itself in useVacuglideDevice; here we only surface errors.
  const doValve = useCallback(
    (state: boolean) => {
      onValve(state).catch((err: Error) => onError(err.message));
    },
    [onError, onValve],
  );

  const press = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (activeRef.current || disabled) return;
      if (releaseTimerRef.current !== null) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      activeRef.current = true;
      pressedAtRef.current = Date.now();
      setActive(true);
      doValve(true);
    },
    [disabled, doValve],
  );

  const release = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (!activeRef.current) return;
      const doRelease = () => {
        activeRef.current = false;
        setActive(false);
        doValve(false);
      };
      const held = Date.now() - pressedAtRef.current;
      if (held >= MIN_PRESS_MS) doRelease();
      else releaseTimerRef.current = setTimeout(doRelease, MIN_PRESS_MS - held);
    },
    [doValve],
  );

  return (
    <Button
      disabled={disabled}
      voiceCommand={voiceCommand}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      className={`flex-1 rounded-lg border py-3 text-lg disabled:opacity-50 ${
        active || forcedActive
          ? "scale-95 border-red-500 bg-red-500 text-white"
          : "border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
      }`}
    >
      {label}
    </Button>
  );
}
