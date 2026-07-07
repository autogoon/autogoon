# The Homegrown algorithm

A fresh, home-grown alternative to the [Autopilot](./ALGORITHM-AUTOPILOT.md).
Unlike the autopilot — which is a faithful reverse-engineering of the original
app — this one is ours to design from scratch.

## The pattern

At its core is a single repeating **dip**: ramp from the 100 peak down to a floor
and back up to 100, stepping by 5 every ~1.25 s. Two controls shape it:

- **Speed** (0–100) — how fast the device runs.
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
can run up to the level's percentage *faster* but only up to 40% *slower*, so high
variability adds spice without dragging legs out.

Changing Variability mid-session first **ramps back up to 100** (at a fixed
10 units/sec) before the new dip depth takes over, so the switch is never jarring,
then continues with fresh cycles at the new floor.

### Speed — a curved low end

Speed doesn't scale the pattern flatly. The **peak** tracks it linearly
(raw 100 → Speed), but the **low point is pulled toward 0 the lower the speed**, so
slow settings still get a usefully wide range instead of a narrow band near the top
— the mapping raises `raw / 100` to an exponent that grows as the speed falls (it's
exactly 1, a plain linear scale, at full speed). For `high` (floor 50):

| Speed | Device range |
|-------|--------------|
| 100%  | 50 – 100 |
| 50%   | ~11 – 50 |
| 10%   | ~1 – 10  |
| 0%    | 0 – 0    |

The scaling is a pure function of the raw speed and the Speed setting — it doesn't
depend on the current floor — so it stays consistent across Variability changes.

## Cumming

`cumming` is a one-shot wind-down: a smooth ramp down to rest over ~15 s that then
holds, plus a suction-valve pulse.

## Voice control

- `faster` / `slower` — step Speed up/down.
- `off` / `low` / `medium` / `high` — set Variability.
- `cumming` — trigger the wind-down.
- plus the shared stroke up/down words.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the algorithm is built — the
engine/player split and the event model that feeds the **Up next** sparkline.

## Ideas / TODO

The intent is a genuinely different edging algorithm. The voice keywords above are
wired; the next steps are richer use of the keyword-spotting input (which the
autopilot has no notion of) and a fuller timeline visualisation.
