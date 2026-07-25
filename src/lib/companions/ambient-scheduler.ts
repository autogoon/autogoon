// The ambient-chat scheduler: the timer that decides when the companion next
// fills a silence, and the latch for calling an end to it. Kept out of the voice
// session deliberately — that hook already carries some twenty refs read by
// callbacks created once and outliving every render, and this would have added
// two more. The session holds one of these instead and drives it by events.
//
// The timing itself is in ambient.ts, which is pure and tested; this owns only
// the state a timer needs.

import { ambientDelayMs } from './ambient';
import type { Companion } from './companions';

export type AmbientScheduler = {
  // A companion turn just finished: line up the next one, unless they've bowed
  // out. Called at the end of every assistant turn, including the ambient ones —
  // that's what makes the loop self-sustaining.
  arm: (companion: Companion, playing: boolean) => void;
  // Something real is on its way, so there's no silence left to fill.
  cancel: () => void;
  // The companion has said their piece and wants the next move to be yours.
  // Survives however many generations a turn produces: a tool call is followed
  // by a reaction, and the arm at the end of that reaction must not undo what
  // the tool asked for.
  hold: () => void;
  // You spoke, so the loop is live again.
  release: () => void;
  // The session is over.
  stop: () => void;
  // When the armed poke will fire, or null if none is. Together with holding()
  // this is the whole of the scheduler's state, surfaced so a session can show
  // what it's about to do rather than leaving it to be inferred from a companion
  // suddenly speaking.
  dueAt: () => number | null;
  // Whether the companion has bowed out and is waiting for you.
  holding: () => boolean;
};

export function createAmbientScheduler(onPoke: () => void): AmbientScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dueAt: number | null = null;
  let held = false;

  function cancel(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    dueAt = null;
  }

  return {
    arm: (companion, playing) => {
      cancel();
      if (held) return;
      const delay = ambientDelayMs(companion, playing, Math.random());
      dueAt = Date.now() + delay;
      timer = setTimeout(() => {
        // Firing consumes the arming: nothing is pending until the turn this
        // starts finishes and arms the next one.
        timer = null;
        dueAt = null;
        onPoke();
      }, delay);
    },
    cancel,
    hold: () => {
      held = true;
      cancel();
    },
    release: () => {
      held = false;
    },
    stop: () => {
      cancel();
      held = false;
    },
    dueAt: () => dueAt,
    holding: () => held,
  };
}
