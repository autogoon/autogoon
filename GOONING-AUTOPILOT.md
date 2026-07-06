# The Gooning algorithm

An automatic, timeline-driven counterpart to the [Homegrown](./HOMEGROWN-AUTOPILOT.md)
algorithm. Where Homegrown hands you Speed and Variability as manual knobs,
Gooning drives them for you over a fixed **30-minute program** (`PROGRAM_MS`): a
slow build that starts gentle and teasing and finishes as a steady hold at the
top. It models a long, unhurried arousal ramp to a controlled climax — a
"gooning" session, not deny-and-repeat edging.

## The build

A **program position** runs 0 → 30 min. Real time advances it 1:1. At each
position two curves are sampled (per appended dip cycle, so the ramp stays smooth
and correct even after a jump):

- **Build top** — the peak of each dip eases from **10 → 100** raw units
  (`EASE_EXPONENT` makes it ease-in: a patient start that accelerates toward the
  finish).
- **Variability** — the dip floor rises from **50% → 100%** of the top and the
  timing jitter falls from **80% → 0**. So it starts with deep, randomised
  teasing dips and ends as a flat hold at the top.

The underlying dip mechanics (stepping by 5 every ~1.25 s, one asymmetric jitter
draw per ramp) are the same as Homegrown's, duplicated so the engine stays
standalone.

## Intensity

**Intensity** (0–100, default **60**) is a flat final multiplier on device
output — the ramp always targets raw 100 internally; intensity scales what's
actually sent. So on a more-sensitive day you set it to 50 and the whole profile
tops out at 50% device speed. It applies at output time, so it reacts live.

## Teases

Each time the position crosses a 5-minute boundary (5/10/15/20 min) a **50 ms
stroke+ pulse** fires. It is suppressed in the final segment (after 25 min) so
nothing interrupts the approach.

## The finish and cumming

At 30 minutes the build reaches the top and **holds there forever** (parked on a
far-future waypoint, the same trick as `cumming`) until you finish.

`cumming()` is Homegrown's wind-down, duplicated: a smooth unscaled ramp from 30
to 0 over ~15 s that then holds at 0, plus a suction-valve pulse.

## Voice control

- `forward` / `back` — jump the position ±1 minute.
- `finish` — jump to the 30-minute hold.
- `more` / `less` — step Intensity up/down by 10.
- `cumming` — trigger the wind-down.
- plus the shared stroke `up` / `down` words (manual vacuum control).

## Layers

Same three-layer shape as the other algorithms, sharing the device layer:

- **`src/lib/gooning-autopilot-engine.ts`** — the `GooningAutopilot` engine.
- **`src/hooks/use-gooning-autopilot.ts`** — the React hook mirroring the engine,
  owning the Intensity default and wiring the voice keywords + pagehide stop.
- **`src/components/gooning-autopilot-panel.tsx`** — the presentation: run button,
  stroke card, the Timeline card (position + forward/back/finish), the **Up next**
  sparkline, the Intensity slider, and the shared command log.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the layers fit together.
