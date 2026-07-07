"use client";

// The Goon algorithm as a React hook. It no longer owns a play loop — it drives
// the shared Player (in the device hook) with a Goon engine, and mirrors the
// player into render state while Goon is the active source. Speed and Variability
// are automatic (engine-driven); the only manual knob is Intensity (default 50),
// plus the timeline transport (forward/back/finish/faster/slower), which are all
// the Player's generic transport.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Goon, PROGRAM_MS } from "@/lib/goon-engine";
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
      const active = player.source === source && player.isPlaying;
      const state = player.getState();
      setIsPlaying(active);
      setCurrentSpeed(active ? state.currentSpeed : 0);
      setUpcoming(active ? player.upcomingWindow(UPCOMING_WINDOW_MS).speed : FLAT);
      setPositionMs(active ? Math.min(state.clock, PROGRAM_MS) : 0);
      setTimeScale(active ? state.rate : 1);
    };
    const unsubscribe = player.subscribe(sync);
    sync();
    return unsubscribe;
  }, [player, source]);

  const start = useCallback(async () => {
    player.setSource(source);
    player.play();
  }, [player, source]);

  const stop = useCallback(() => player.pause(), [player]);

  const changeIntensity = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      setIntensity(clamped);
      source.setIntensity(clamped);
    },
    [source],
  );

  const stepIntensity = useCallback(
    (delta: number) => changeIntensity(intensity + delta),
    [intensity, changeIntensity],
  );

  // Transport is the Player's — each is a no-op unless Goon is the active playing
  // source. faster/slower/forward/back/finish don't regenerate: events are stamped
  // in program-time, so the Player just moves/consumes the cursor and the
  // deterministic build/tease at each position keep it correct.
  const forward = useCallback(() => {
    if (player.source === source && player.isPlaying) player.forward();
  }, [player, source]);
  const back = useCallback(() => {
    if (player.source === source && player.isPlaying) player.back();
  }, [player, source]);
  const finish = useCallback(() => {
    if (player.source === source && player.isPlaying) player.seekTo(PROGRAM_MS);
  }, [player, source]);
  const faster = useCallback(() => {
    if (player.source === source && player.isPlaying) player.faster();
  }, [player, source]);
  const slower = useCallback(() => {
    if (player.source === source && player.isPlaying) player.slower();
  }, [player, source]);

  const cumming = useCallback(() => {
    try {
      source.beginCumming();
      if (player.source === source && player.isPlaying) player.invalidateFuture();
    } catch (err) {
      log(`error: ${(err as Error).message}`, "error");
    }
  }, [player, source, log]);

  const keywords = useMemo<KeywordAction[]>(
    () => [
      ...stroke.keywords,
      { word: "more", run: () => stepIntensity(INTENSITY_STEP) },
      { word: "less", run: () => stepIntensity(-INTENSITY_STEP) },
      { word: "forward", run: forward },
      { word: "back", run: back },
      { word: "finish", run: finish },
      { word: "faster", run: faster },
      { word: "slower", run: slower },
      { word: "cumming", run: cumming },
    ],
    [stroke.keywords, stepIntensity, forward, back, finish, faster, slower, cumming],
  );

  return {
    isPlaying,
    currentSpeed,
    upcoming,
    positionMs,
    programMs: PROGRAM_MS,
    timeScale,
    start,
    stop,
    intensity,
    changeIntensity,
    forward,
    back,
    finish,
    faster,
    slower,
    cumming,
    strokePulsing: stroke.strokePulsing,
    keywords,
  };
}

export type GoonController = ReturnType<typeof useGoon>;
