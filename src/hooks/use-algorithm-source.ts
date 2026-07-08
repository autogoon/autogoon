"use client";

// The source-binding every algorithm hook shares: the parts that are identical
// no matter which algorithm it is. An algorithm hook owns its engine, its knobs
// and its keyword vocabulary; this owns "is the shared Player pointed at my
// engine, and if so what is it doing", the start/stop/arm lifecycle, and the
// guard (`whenCurrent`) that stops one algorithm from poking the Player's
// program while another algorithm is the active source.

import { useCallback } from "react";
import type { AlgorithmEngine, PlayerState } from "@/lib/program";
import type { PlayerView } from "@/hooks/use-player";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

export function useAlgorithmSource(
  vacuglide: VacuglideDeviceController,
  source: AlgorithmEngine,
  view: PlayerView,
) {
  const { player } = vacuglide;

  // This algorithm's slice of the shared player, derived from the view (no
  // subscription of its own): is the Player pointed at this engine, and if so
  // what is it doing. When it isn't ours the algorithm reads as idle/"armed".
  const isCurrent = view.source === source;
  const state: PlayerState = isCurrent ? view.state : "armed";
  const currentSpeed = isCurrent && view.isPlaying ? view.currentSpeed : 0;

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

  // Run a Player mutation (refresh/invalidateFuture/reset) only while the Player
  // is pointed at this source, so a knob or ending on one algorithm can never
  // regenerate another algorithm's live program.
  const whenCurrent = useCallback(
    (fn: () => void) => {
      if (player.source === source) fn();
    },
    [player, source],
  );

  return { isCurrent, state, currentSpeed, start, stop, arm, whenCurrent };
}
