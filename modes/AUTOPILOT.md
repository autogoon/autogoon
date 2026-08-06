# The Autopilot play mode

A recreation of Autoblow's own Vacuglide autopilot, the official "hands-off"
mode. Reverse-engineered from the original app's client bundle as it stood in
**July 2026** and rebuilt to run entirely in your browser, faithful down to its
constants. That bundle ships under a fresh name on each of their deploys, and
their implementation isn't independently documented, so it may drift from what
is written here.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for how it plugs into the app.

## The mystery script

Autopilot plays a **mystery script**. It stitches together a long, unpredictable
run from **8 hand-crafted patterns**, picking 10 of them at random with repeats
allowed, then drawing afresh. The patterns:

1. **Slow full staircase** — climbs step by step from a crawl up to full and
   back down, lingering ~5 s on each step.
2. **Gentle half staircase** — the same shape but only up to about half speed,
   and slower still.
3. **Medium / max / low** — holds at medium, jumps to full, drops to a
   near-stop, over and over.
4. **Square wave** — a hard on/off between a crawl and full speed, nothing in
   between.
5. **Rising peaks** — a low dip before each of a rising series of peaks (roughly
   50 → 60 → 70 → 80 → 90 → 100).
6. **Gentle low waves** — small rolling waves that stay down in the slow range.
7. **Max plateaus, shrinking rests** — repeated bursts to full speed with the
   rest valleys between them getting ever shorter.
8. **Quick ramp to a high hold** — a fast climb to near-full, then a sustained
   high plateau.

A draw of ten runs roughly 5–30 minutes, then a new random draw begins.

## How a draw is laid out

The pattern descriptions name the **templates**. These properties of playback do
not follow from them:

- A draw opens with a `speed: 10` at time 0, ahead of the first template step.
  It skips the intensity remap, so on High it sits below that level's floor
  of 30.
- Each step is emitted at the **end** of its own duration, so its speed is in
  effect for the _following_ step's duration, and the opening `speed: 10` covers
  the first step's. In **Max plateaus, shrinking rests** the rests shrink in the
  template, while the span that shortens in playback is the hold at full speed.

## Intensity → how hard

How hard it works you, from a gentle **Warmup** through **Low** and **Medium**
to a full-on **High**. Each template speed is remapped from its 5–100 range into
the level's range:

| Intensity | min | max |
| --------- | --: | --: |
| Warmup    |   5 |  20 |
| Low       |   5 |  30 |
| Medium    |  15 |  70 |
| High      |  30 | 100 |

`scaled = round(min + (speed − 5)/95 × (max − min))`

E.g. a template step of 100 becomes 20 on Warmup, 70 on Medium, 100 on High.

## Edge control → how it paces the peaks

How long it lingers at the extremes. **Gentle** eases off the top quickly and
stretches out the recovery valleys; **Intense** holds you at the peaks and cuts
the recovery short; **Moderate** sits in between. It's a duration multiplier on
each step, keyed off the **template** speed:

| Edge     | plateau (speed > 70) | cooldown (speed < 30) |
| -------- | -------------------: | --------------------: |
| Gentle   |                 ×0.5 |                    ×2 |
| Moderate |                   ×1 |                    ×1 |
| Intense  |                 ×1.5 |                  ×0.5 |

Steps from 30 to 70 inclusive are never warped.

Intense's speed bump and Gentle's shave are keyed differently from the
durations. They apply as each move is sent, to the **intensity-scaled** speed
rather than the template speed. Intense adds
`speed += random(0 .. min(100 − speed, 15))`. Gentle takes
`speed −= round(min(speed − 50, 20) × 0.5)`. Moderate leaves it alone. The band
is `> 70` on the scaled value and Medium's ceiling is exactly 70, so neither
fires below High.

## Vacuum maintenance (suction control)

**Vacuum maintenance** is Autoblow's own name for it. The device can lose a
little suction over a session, so this fires a brief **stroke-minus** pulse to
re-apply the vacuum and keep the toy firmly seated. Because stroke-minus also
shortens the stroke each time, keeping it topped up trends toward short strokes
with strong suction — not necessary, but a feel some enjoy.

The settings are **Off**, **Light** and **Heavy**:

| Setting        | baseDuration | speedMultiplier | interval |
| -------------- | -----------: | --------------: | -------: |
| Off            |            — |               — |        — |
| Light (little) |        200ms |             0.8 |   3000ms |
| Heavy (more)   |        400ms |             0.6 |   2000ms |

A pulse fires only **when a speed move is sent** — at a script step transition,
never mid-step — and only if at least `interval` has passed since the last
pulse. The interval is a **minimum gap between pulses, not a cadence**. A long
step gets one pulse at its start and nothing more, and steps arriving sooner
than the gap are skipped.

Nothing fires in the first `interval` of a session (`lastSuctionTime` starts at
0). Changing the suction setting resets it, so the next move pulses immediately.

Pulse length: `round(baseDuration × speedMultiplier / (speed/100 + 0.1))`, where
`speed` is the move just sent (intensity-scaled, jitter included). Slow strokes
get long pulses (Light at speed 10: 800 ms) and fast strokes short ones.

## Manual override

- **Stroke − / Stroke +**: press-and-hold buttons that shorten (−) or lengthen
  (+) the stroke. Press opens the valve, release closes it, with a **minimum
  open time of 300 ms** so a quick tap still registers.
- **Finish**: closes both valves, stops the vacuum-maintenance pulses and pushes
  to full speed, leaving your other settings as you had them. The original ends
  the script there. The 30-minute hold is this app's.

## Voice control

On top of the transport words Goon, Groove and Autopilot share (see
[MODES.md](../MODES.md)):

- `more` / `less` — step Intensity up/down.
- `gentle` / `moderate` / `intense` — set Edge control.
- `off` / `light` / `heavy` — set Vacuum maintenance.
- `finish` — the run to full speed (see [Manual override](#manual-override)).
