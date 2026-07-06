# The Gooning algorithm

An automatic, timeline-driven counterpart to the [Homegrown](./HOMEGROWN-AUTOPILOT.md)
algorithm. Where Homegrown hands you Speed and Variability as manual knobs,
Gooning drives them for you over a fixed **30-minute program** (`PROGRAM_MS`): a
slow build that starts gentle and teasing and finishes as a steady hold at the
top. It models a long, unhurried arousal ramp to a controlled climax — a
"gooning" session, not deny-and-repeat edging.

## The build

It **is** the Homegrown algorithm with its two manual knobs driven automatically.
The dip is always Homegrown's raw pattern **100 → floor → 100**, mapped to the
device through Homegrown's curved-low-end `scaleSpeed`. A **program position**
runs 0 → 30 min (real time advances it 1:1), and each appended dip cycle samples
two curves at its own start position (so the ramp stays smooth and correct even
after a jump):

- **Speed** (Homegrown's `speedPercent`) — eases from **25 → 100** over the 30
  minutes (`BUILD_EXP` makes it ease-in: a patient start that accelerates toward
  the finish). Because the dip is raw `100 → floor` and `scaleSpeed` pulls the low
  point toward 0 the lower the speed, the early low-speed dips still swing over a
  **wide** device range (≈25 down to ≈3 at full intensity) with **long** legs
  (~12.5 s), rather than a narrow band near the top.
- **Variability** — the raw dip floor rises from **50 → 100** (a deep `100 → 50`
  tease dip shrinking to no dip) and the timing jitter falls from **80% → 0**. So
  it starts with long, deep, slow, randomised dips and ends as a flat hold at the
  top; the legs naturally shorten as the dips get shallower.

The underlying dip mechanics (stepping by 5 every ~1.25 s, one asymmetric jitter
draw per ramp, and `scaleSpeed`) are the same as Homegrown's, duplicated so the
engine stays standalone.

## Intensity

**Intensity** (0–100, default **50**) is a flat final multiplier applied on top
of the scaled output — the build/variability shape is generated independently and
intensity just scales what's actually sent. So on a more-sensitive day you set it
to 50 and the whole profile tops out at 50% device speed. It applies at output
time, so it reacts live.

## Teases

Automatic teasing runs in two phases:

- **First 10 minutes** — a **5-second stroke− pulse every minute** (at 0–9 min,
  starting right at session start).
- **From 10 minutes on** — a **50 ms stroke+ pulse every 5 minutes** (at 10, 15,
  20 min), suppressed in the final segment (after 25 min) so nothing interrupts
  the approach.

Both are jump-aware: `forward`/`back`/`finish` re-baseline the boundaries, so a
re-crossing fires again without double-firing. This is separate from the manual
Stroke ± / `up`/`down` controls.

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
