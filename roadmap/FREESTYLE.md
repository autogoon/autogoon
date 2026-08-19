# Freestyle mode

Just the raw device controls: speed, and the stroke+ / stroke- valves — no
program, you drive.

The safe word is in the grammar only while the Player plays (`page.tsx`) and is
routed to `player.pause()`. An answer that drives the device directly loses it —
see [The safe word](./SAFE-WORD.md).

Open questions:

- **Which words step the speed.** Voice-first in play
  ([CLAUDE.md](../CLAUDE.md#voice-first-in-play)) rules out a spoken value, and
  the pair a magnitude knob steps on today is `more`/`less`. `faster`/`slower`
  are taken — they step the Player's playback rate. The stroke valves need no
  answer: `up` and `down` in `use-stroke-controls.ts` are already shared by
  every panel, though they are gated on `player.isPlaying`.
- **Does it use the Player at all?** Driving `VacuglideDevice`
  (`src/lib/vacuglide-device.ts`) directly would make it the first play mode
  outside the engine/panel shape, and would need a speed path that doesn't exist
  — `targetSpeedSet` has only ever been called by `player.ts`, though the valves
  already fall through to the device when nothing is playing. A trivial
  pass-through engine avoids both, keeps mutual exclusion (the Player holds one
  engine at a time), and keeps `player.isPlaying` true. The shared stroke
  controls and the safe word are each gated on it.
