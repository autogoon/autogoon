# The Goon algorithm

An automatic, timeline-driven counterpart to the
[Homegrown](./ALGORITHM-HOMEGROWN.md) algorithm. Where Homegrown hands you Speed
and Variability as manual knobs, Goon drives them for you over a fixed
**30-minute program**: a slow build that starts gentle and teasing and finishes as
a steady hold at the top. It models a long, unhurried arousal ramp to a controlled
climax — a "gooning" session, not deny-and-repeat edging.

## The build

It **is** the Homegrown dip pattern with its two knobs driven automatically. The
dip is always Homegrown's raw pattern **100 → floor → 100**, mapped to the device
through Homegrown's curved low end. A **position** runs from 0 to 30 minutes, and
the two curves are sampled at that position:

- **Speed** eases from **25 → 100** across the 30 minutes — a patient start that
  accelerates toward the finish. Because the dip is raw `100 → floor` and the
  curved low end pulls the low point toward 0 the lower the speed, the early
  low-speed dips still swing over a **wide** device range (≈25 down to ≈3 at full
  intensity) with **long** legs, rather than a narrow band near the top.
- **Variability** decreases: the dip floor rises from **50 → 100** (a deep
  `100 → 50` tease dip shrinking to no dip) and the timing jitter falls from
  **80% → 0**. So it starts with long, deep, slow, randomised dips and ends as a
  flat hold at the top; the legs naturally shorten as the dips get shallower.

## Intensity

**Intensity** (0–100, default **50**) is a flat final multiplier on the built
profile — the build/variability shape is generated independently and intensity
just scales what's actually sent. So on a more-sensitive day you set it to 50 and
the whole profile tops out at 50% device speed. It applies at send time, so it
reacts live.

## Teases

Automatic teasing runs in two phases:

- **First 10 minutes** — a **5-second stroke− pulse every minute** (at 0–9 min,
  starting right at session start).
- **From 10 minutes on** — a brief **stroke+ pulse every 5 minutes** (at 10, 15,
  20 min), suppressed in the final segment (after 25 min) so nothing interrupts the
  approach.

These are separate from the manual Stroke ± / `up`/`down` controls.

## The finish and cumming

At 30 minutes the build reaches the top and **holds there** until you finish.
`finish` jumps straight to that hold. `cumming` triggers a smooth wind-down — a
ramp down to rest over ~15 s, then a hold — plus a suction-valve pulse.

## Time dilation

**`faster` / `slower`** stretch or compress the journey from that point on
(~5% per step, roughly 0.25×–4×). They don't jump the position; they change how
fast you move through the build (and the tease schedule) from here. The device's
own stroke rhythm stays real-time; only the build/variability curve compresses or
stretches. The Timeline card shows the current factor (e.g. `1.20×`).

## Voice control

- `forward` / `back` — jump the position ±1 minute.
- `finish` — jump to the 30-minute hold.
- `faster` / `slower` — dilate time ±5% from this point on.
- `more` / `less` — step Intensity up/down.
- `cumming` — trigger the wind-down.
- plus the shared stroke `up` / `down` words (manual vacuum control).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the algorithm is built — the
engine/player split, the event model, and how Goon's position maps to the Player's
clock (so `forward`/`back`/`finish`/`faster`/`slower` are just the Player moving or
dilating that clock).
