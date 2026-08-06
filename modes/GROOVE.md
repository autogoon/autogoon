# The Groove play mode

The most hands-on of the play modes: a single repeating **dip** you shape live
while it runs. It runs from the top, plunges, and climbs back, over and over,
for as long as you like. There's no timeline and no ending.

## Shaping it

**Intensity** sets how hard it is; the two **variability** knobs set how much
the dips vary.

- **Intensity** (0–100, default **10**) — a ceiling on the whole pattern. It
  scales evenly. A dip that would plunge to a standstill still does; turning it
  down makes everything gentler without flattening the dips into a narrow
  flutter near the top. It takes effect live.
- **Dip variability** (default **medium**) — how deep a dip may go. At _off_
  every dip lands in the same place, the standard `100 → 60`. Each level up lets
  a dip be drawn _deeper_ than that (never shallower), and the draw is weighted
  toward the deep end. At _high_ a plunge can take you all the way to a dead
  stop and often comes close.
- **Timing variability** (default **medium**) — how long a dip takes. At _off_
  every rise and fall runs its full ten seconds. Each level up lets a leg be
  randomly cut shorter — at _high_, to as little as a quarter of that — skewed
  so the sharp ones come up more often than the slow ones. The pace lurches.

A deeper dip doesn't take longer; it ramps _steeper_. The speed eases into the
bottom of a dip instead of stepping evenly down to it, because a few units of
speed matter far more at a crawl than they do near full. The slow part of a dip
lingers.

Change either variability mid-session and the next dip sets off from wherever
the device already is, rather than snapping back to the top first.

## Cumming

Say `cumming` for the wind-down: the device eases down from a moderate pace to a
standstill over about ten seconds — the strokes shortening as it goes — then
rests.

## Voice control

On top of the transport words Goon, Groove and Autopilot share (see
[MODES.md](../MODES.md)):

- `more` / `less` — step Intensity up or down.
- `hillier` / `flatter` — step Dip variability up or down.
- `off` / `low` / `medium` / `high` — set Timing variability.
- `cumming` — the wind-down.

Dip variability has the same four levels, but steps through them with `hillier`
/ `flatter`, since one set of level words can't serve both.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for how it's built.
