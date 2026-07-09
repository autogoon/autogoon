# The Groove algorithm

A fresh alternative to the [Autopilot](./ALGORITHM-AUTOPILOT.md).
Where the autopilot faithfully recreates the original app, this one is ours to
design from scratch — and it's the most hands-on: a single repeating **dip** you
shape live while it runs. It runs from the top, plunges, and climbs back — over
and over, for as long as you like. There's no timeline and no ending: you decide
when it's over.

## Shaping it

Three controls. **Intensity** sets how hard it is; the two **variability** knobs
decide how much the dips surprise you.

- **Intensity** (0–100, default **10**) — a ceiling on the whole pattern. It
  scales evenly, so a dip that would plunge to a standstill still does; turning it
  down makes everything gentler without flattening the dips into a narrow flutter
  near the top. It takes effect live.
- **Dip variability** — how deep a dip may go. At **off** every dip lands in the
  same place, a comfortable `100 → 60` bob. Each level up lets a dip be drawn
  _deeper_ than that (never shallower), and the draw is weighted toward the deep
  end, so at **high** a plunge can take you all the way to a dead stop and often
  comes close. Nothing is ever taken away as you turn it up — only added.
- **Timing variability** — how long a dip takes. At **off** every rise and fall
  runs its full, unhurried ten seconds. Each level up lets a leg be randomly cut
  shorter — at **high**, to as little as a quarter of that — skewed so the sharp,
  interesting ones come up more often than the slow ones. The pace lurches; no two
  dips feel quite the same.

Two more things you'll feel rather than read. A deeper dip doesn't take longer, it
ramps _steeper_. And the speed eases into the bottom of a dip instead of stepping
evenly down to it, because a few units of speed matter far more at a crawl than
they do near full — so the slow part of a dip lingers.

Change either variability mid-session and nothing lurches: the next dip sets off
from wherever the device already is, rather than snapping back to the top first.

## Cumming

Say **cumming** for the send-off: the device eases down in a slow glide from a
moderate pace to a standstill over about fifteen seconds — the strokes shortening
as it goes — then rests. It's a gentle, drawn-out finish — which is simply how the
author likes to cum, and won't be to everyone's taste; take it as one way to end,
not the only one.

## Voice control

- **more** / **less** — step Intensity up or down.
- **hillier** / **flatter** — step Dip variability up or down.
- **off** / **low** / **medium** / **high** — set Timing variability.
- **cumming** — the wind-down.
- plus the shared **up** / **down** stroke words — lengthen (**up**) or shorten
  (**down**) the stroke by hand.

Only Timing variability gets the level words outright; Dip variability steps
through the same four levels with **hillier** / **flatter**, since one set of
level words can't serve both.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how it's built.
