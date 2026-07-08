"use client";

// The Goon algorithm as a React hook. It no longer owns a play loop — it drives
// the shared Player (in the device hook) with a Goon engine, and mirrors the
// player into render state while Goon is the active source. Speed and Variability
// are automatic (engine-driven); the only manual knob is Intensity (default 50),
// plus the timeline transport (forward/back/finish/faster/slower), which are all
// the Player's generic transport.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Goon, PROGRAM_MS } from "@/lib/goon-engine";
import type { PlayerState } from "@/lib/program";
import { UPCOMING_WINDOW_MS, type CurvePoint } from "@/components/sparkline";
import type { KeywordAction } from "@/hooks/use-algorithm-runner";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

const DEFAULT_INTENSITY = 50;
const INTENSITY_STEP = 10;

const FLAT: CurvePoint[] = [
  { t: 0, speed: 0 },
  { t: UPCOMING_WINDOW_MS, speed: 0 },
];

export function useGoon(vacuglide: VacuglideDeviceController) {
  const { player, log } = vacuglide;
  const stroke = useStrokeControls(vacuglide);

  const [isPlaying, setIsPlaying] = useState(false);
  const [state, setState] = useState<PlayerState>("armed");
  const [isCurrent, setIsCurrent] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [upcoming, setUpcoming] = useState<CurvePoint[]>(FLAT);
  const [positionMs, setPositionMs] = useState(0);
  const [timeScale, setTimeScale] = useState(1);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);

  const sourceRef = useRef<Goon | null>(null);
  sourceRef.current ??= new Goon({ intensity: DEFAULT_INTENSITY });
  const source = sourceRef.current;

  // Mirror the player into render state, but only while Goon is the active source
  // (the shared player may be idle or running another algorithm). Position is the
  // player's clock (clamped to the build length) and time dilation is its rate.
  useEffect(() => {
    const sync = () => {
      const current = player.source === source;
      const st = player.getState();
      const playing = current && st.state === "playing";
      setIsCurrent(current);
      setState(current ? st.state : "armed");
      setIsPlaying(playing);
      setCurrentSpeed(playing ? st.currentSpeed : 0);
      setUpcoming(
        current ? player.upcomingWindow(UPCOMING_WINDOW_MS).speed : FLAT,
      );
      setPositionMs(current ? Math.min(st.clock, PROGRAM_MS) : 0);
      setTimeScale(current ? st.rate : 1);
    };
    const unsubscribe = player.subscribe(sync);
    sync();
    return unsubscribe;
  }, [player, source]);

  // Arm this source if it isn't already the Player's (fresh session), then play.
  // If we're already armed/paused on this source, play() just begins/resumes —
  // it never calls setSource, so a held position survives.
  const start = useCallback(async () => {
    if (player.source !== source) player.arm(source);
    player.play();
  }, [player, source]);

  const stop = useCallback(() => player.pause(), [player]);

  // Build/preview this source without playing — called by the page when this
  // tab becomes visible while nothing is in progress.
  const arm = useCallback(() => {
    if (player.source !== source) player.arm(source);
  }, [player, source]);

  const changeIntensity = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      setIntensity(clamped);
      source.setIntensity(clamped);
      if (player.source === source) player.refresh();
    },
    [player, source],
  );

  const stepIntensity = useCallback(
    (delta: number) => changeIntensity(intensity + delta),
    [intensity, changeIntensity],
  );

  // Restore Intensity to its default and regenerate a fresh program. Only valid
  // when stopped (the Reset control is hidden while playing). changeIntensity
  // updates the knob + engine; player.reset() re-arms (engine.reset() clears the
  // cumming latch and generation restarts at position 0).
  const reset = useCallback(() => {
    changeIntensity(DEFAULT_INTENSITY);
    if (player.source === source) player.reset();
  }, [player, source, changeIntensity]);

  // Transport is the Player's — each is a no-op unless Goon is the active playing
  // source. faster/slower/forward/back/finish don't regenerate: events are stamped
  // in program-time, so the Player just moves/consumes the cursor and the
  // deterministic build/tease at each position keep it correct.
  const forward = useCallback(() => {
    if (player.source === source) player.forward();
  }, [player, source]);
  const back = useCallback(() => {
    if (player.source === source) player.back();
  }, [player, source]);
  const finish = useCallback(() => {
    if (player.source === source) player.seekTo(PROGRAM_MS);
  }, [player, source]);
  const faster = useCallback(() => {
    if (player.source === source) player.faster();
  }, [player, source]);
  const slower = useCallback(() => {
    if (player.source === source) player.slower();
  }, [player, source]);

  const cumming = useCallback(() => {
    try {
      source.beginCumming();
      // Splice the wind-down now whenever Goon is the current source — including
      // while paused, so voice "cumming" mid-pause takes effect on resume rather
      // than being deferred behind the already-built lookahead.
      if (player.source === source) player.invalidateFuture();
    } catch (err) {
      log(`error: ${(err as Error).message}`, "error");
    }
  }, [player, source, log]);

  // Knobs and timeline transport are valid whenever Goon is the current source
  // (armed, playing or paused); cumming (the ending) only during a session.
  const canEnd = state !== "armed";

  const keywords = useMemo<KeywordAction[]>(
    () => [
      ...stroke.keywords,
      { word: "more", enabled: isCurrent, run: () => stepIntensity(INTENSITY_STEP) },
      { word: "less", enabled: isCurrent, run: () => stepIntensity(-INTENSITY_STEP) },
      { word: "forward", enabled: isCurrent, run: forward },
      { word: "back", enabled: isCurrent, run: back },
      { word: "finish", enabled: isCurrent, run: finish },
      { word: "faster", enabled: isCurrent, run: faster },
      { word: "slower", enabled: isCurrent, run: slower },
      { word: "cumming", enabled: canEnd, run: cumming },
    ],
    [
      stroke.keywords,
      isCurrent,
      canEnd,
      stepIntensity,
      forward,
      back,
      finish,
      faster,
      slower,
      cumming,
    ],
  );

  return {
    isPlaying,
    state,
    isCurrent,
    currentSpeed,
    upcoming,
    positionMs,
    programMs: PROGRAM_MS,
    timeScale,
    start,
    stop,
    arm,
    reset,
    intensity,
    changeIntensity,
    forward,
    back,
    finish,
    faster,
    slower,
    cumming,
    canStroke: stroke.canStroke,
    canEnd,
    strokePulsing: stroke.strokePulsing,
    keywords,
  };
}

export type GoonController = ReturnType<typeof useGoon>;
