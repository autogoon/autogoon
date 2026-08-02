// The one place the shared Player is mirrored into React state. The Player is
// plain JS (it drives the device on its own); this hook is the single bridge
// that turns its live state into something the panels can render — the
// upcoming-speed preview and transport position/rate. It is
// play-mode-agnostic (the Player has one active source at a time) and is mounted
// ONCE, so this mirror exists in exactly one place instead of being re-derived
// inside every play mode hook.

import { useEffect, useState } from 'react';
import type { Player } from '@/lib/player';
import {
  UPCOMING_WINDOW_MS,
  type PlayModeEngine,
  type PlayerState,
  type UpcomingWindow,
} from '@/lib/program';

export interface PlayerView {
  // The engine the Player is currently pointed at (null when idle). A play mode
  // hook compares this to its own engine to test whether it is the active source.
  source: PlayModeEngine | null;
  state: PlayerState;
  isPlaying: boolean;
  positionMs: number;
  timeScale: number;
  // A scheduled (engine-generated) stroke is holding a valve open right now —
  // the manual stroke controls disable while it plays out.
  strokeBusy: boolean;
  upcoming: UpcomingWindow;
}

function read(player: Player): PlayerView {
  const st = player.getState();
  return {
    source: player.source,
    state: st.state,
    isPlaying: st.isPlaying,
    positionMs: st.clock,
    timeScale: st.rate,
    strokeBusy: st.strokeBusy,
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
