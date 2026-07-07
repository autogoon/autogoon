# The Homegrown algorithm

A fresh, home-grown alternative to the [Autopilot](./ALGORITHM-AUTOPILOT.md).
Unlike the autopilot — which is a faithful reverse-engineering of the original
app — this one is ours to design from scratch.

## The pattern

At its core is a single repeating **dip**: ramp from the 100 peak down to a
floor and back up to 100, stepping by 5 every ~1.25s. Two controls shape it:

- **Speed** (`speedPercent`, 0–100) — how fast the device runs.
- **Variability** (`off` / `low` / `medium` / `high`) — a single control that
  drives *both* how deep the dip goes *and* how randomised its timing is.

### Variability — depth and timing together

| Level  | Floor | Timing jitter (faster / slower) |
|--------|-------|---------------------------------|
| off    | 100 (no dip — holds at the top) | 0% / 0%   |
| low    | 85    | −25% / +25% |
| medium | 65    | −50% / +40% |
| high   | 50    | −80% / +40% |

The floor is the bottom of the dip; `off` sets it to 100, so both ramps are
zero-length and the pattern just holds at the top. All floors are multiples of 5
so each ramp divides into whole steps.

The jitter randomises how long a ramp takes — **one random draw per ramp**, not
per step, so a ramp stays a smooth line at its own pace (this ramp is
quicker/slower) rather than jittering step to step. It's **asymmetric**: a ramp
can run up to the level's percentage *faster* but only up to 40% *slower*
(`SLOW_JITTER_CAP`), so high variability adds spice without dragging legs out.

Changing Variability mid-session first **ramps back up to 100** (at a fixed
10 units/sec) before the new dip depth takes over, so the switch is never
jarring, then continues with fresh cycles at the new floor.

### Speed — a curved low end

Speed doesn't scale the pattern flatly. The **peak** tracks it linearly
(raw 100 → `speedPercent`), but the **low point is pulled toward 0 the lower the
speed**, so slow settings still get a usefully wide range instead of a narrow
band near the top. `scaleSpeed` raises `raw/100` to an exponent that grows as the
speed falls (it's exactly 1 — a plain linear scale — at full speed); the
`LOW_END_GAMMA` constant tunes how aggressive that is. For `high` (floor 50):

| Speed | Device range |
|-------|--------------|
| 100%  | 50 – 100 |
| 50%   | ~11 – 50 |
| 10%   | ~1 – 10  |
| 0%    | 0 – 0    |

The scaling is a pure function of the raw speed and `speedPercent` — it doesn't
depend on the current floor — so it stays consistent across Variability changes.

### The timeline

`currentTime` and `script` are a permanent record of the whole play session (for
the sparkline preview and a future timeline view); neither resets except on a
fresh `start()`. The engine keeps roughly **one minute of future built ahead**
(`SCRIPT_LOOKAHEAD_MS`), appending fresh cycles each tick as the horizon is
consumed. An explicit command (a Variability change, or `cumming()`) instead
splices from *now* — keeping everything already sent as real history and
rebuilding only the un-played future.

`cumming()` is a one-shot wind-down: a smooth unscaled ramp from 30 to 0 over
~15s that then holds at 0 (parked via a far-future waypoint the loop wraps onto),
plus a suction-valve pulse.

## Voice control

The algorithm exposes keyword actions to the keyword-spotter, so it can be driven
hands-free:

- `faster` / `slower` — step Speed up/down by 10.
- `off` / `low` / `medium` / `high` — set Variability.
- `cumming` — trigger the wind-down.
- plus the shared stroke up/down words.

## Layers

It follows the same three-layer shape as the autopilot and shares the same
device layer:

- **`src/lib/homegrown-engine.ts`** — the `Homegrown` engine.
  It drives the device purely through a `getDevice()` accessor it is handed, so
  it reuses the same `useVacuglideDevice` device layer as everything else.
  `getUpcomingCurve()` exposes the next minute of script for the sparkline.
- **`src/hooks/use-homegrown.ts`** — the React hook mirroring the
  engine into render state (including the live `upcoming` curve), wiring the
  voice keywords and the `pagehide` safety-stop.
- **`src/components/homegrown-panel.tsx`** — the presentation: run
  button, stroke card, the **Up next** sparkline, the Speed slider, the
  Variability control, and the shared command log.

The sparkline itself lives in **`src/components/sparkline.tsx`** — a glanceable
step-line of the upcoming speed, coloured green→yellow→red by speed and redrawn
every tick.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the engine/hook/panel layers,
the shared device, and the algorithm runner fit together.

## Ideas / TODO

The intent is a genuinely different edging algorithm. The voice keywords above
are wired; the next steps are richer use of the keyword-spotting input (which the
autopilot has no notion of) and a fuller timeline visualisation built on the
permanent `script` record.
