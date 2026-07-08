"use client";

// The one place the shared Player is mirrored into React state. The Player is
// plain JS (it drives the device on its own); this hook is the single bridge
// that turns its live state into something the panels can render — current
// speed, the upcoming-speed preview, transport position/rate. It is
// algorithm-agnostic (the Player has one active source at a time) and is mounted
// ONCE, so this mirror exists in exactly one place instead of being re-derived
// inside every algorithm hook.

import { useEffect, useState } from "react";
import type { Player } from "@/lib/player";
import {
  UPCOMING_WINDOW_MS,
  type AlgorithmEngine,
  type PlayerState,
  type UpcomingWindow,
} from "@/lib/program";

export interface PlayerView {
  // The engine the Player is currently pointed at (null when idle). An algorithm
  // hook compares this to its own engine to know whether it is the active source.
  source: AlgorithmEngine | null;
  state: PlayerState;
  isPlaying: boolean;
  currentSpeed: number;
  positionMs: number;
  timeScale: number;
  upcoming: UpcomingWindow;
}

function read(player: Player): PlayerView {
  const st = player.getState();
  return {
    source: player.source,
    state: st.state,
    isPlaying: st.isPlaying,
    currentSpeed: st.currentSpeed,
    positionMs: st.clock,
    timeScale: st.rate,
    // Preview a constant *real*-time horizon: at playback rate R, R× as much
    // program-time elapses per real second, so widen the program-time window by R.
    // The "+60s" label stays true and the sparkline reflects the time dilation.
    upcoming: player.upcomingWindow(UPCOMING_WINDOW_MS * st.rate),
  };
}

export function usePlayer(player: Player): PlayerView {
  const [view, setView] = useState<PlayerView>(() => read(player));
  useEffect(() => {
    const sync = () => setView(read(player));
    const unsubscribe = player.subscribe(sync);
    sync();
    return unsubscribe;
  }, [player]);
  return view;
}
