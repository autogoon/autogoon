# The Autopilot algorithm

A recreation of `fun.autoblow.com/vacuglide/autopilot`, reverse-engineered from the
original app's client bundle (`autopilot-Krw_IcWx.js`); the recreation is faithful,
including its constants. Everything runs client-side in the browser.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how it plugs into the app (the
engine/player split and the shared device layer).

## The mystery script

Autopilot generates a **mystery script**: a long random sequence of speed
waypoints.

- There are **8 hand-authored pattern templates**: staircases up/down, gentle low
  waves, square waves between low and max, rising peaks with rest dips, repeated
  max plateaus with shrinking valleys, and a sustained high plateau. Template
  speeds span 5–100 with durations of 2–10 s per step.
- Generation picks **10 templates uniformly at random** (repeats allowed) and
  concatenates them, so a run is roughly 10–60 minutes of waypoints, then loops.
- Each template step is transformed by the two settings below.

So "when does it go faster/slower and by how much" is: **the shape comes from the
randomly-chosen templates; the settings only rescale speeds and stretch or shrink
duration.** Changing intensity or edge control regenerates the upcoming script
(a fresh random selection); changing the suction setting takes effect without
disturbing the speed script.

## Intensity → how fast

Each template speed is linearly remapped from template space (5–100) into the
intensity range, then clamped:

| Intensity | min | max |
| --------- | --: | --: |
| Warmup    |   5 |  20 |
| Low       |   5 |  30 |
| Medium    |  15 |  70 |
| High      |  30 | 100 |

`scaled = round(min + (speed − 5)/95 × (max − min))`

E.g. a template step of 100 becomes 20 on Warmup, 70 on Medium, 100 on High.

## Edge control → how long

Duration multipliers applied per step, keyed off the **template** speed:

| Edge     | plateau (speed > 70) | cooldown (speed < 30) |
| -------- | -------------------: | --------------------: |
| Gentle   |                 ×0.5 |                    ×2 |
| Moderate |                   ×1 |                    ×1 |
| Intense  |                 ×1.5 |                  ×0.5 |

Steps between 30 and 70 are never warped. So "gentle" halves time spent at high
speed and doubles the recovery valleys; "intense" does the opposite.

Edge control also adds **jitter** to plateau speeds (again only when the scaled
speed is above 70):

- **Intense:** `speed += random(0 .. min(100 − speed, 15))` — random surges above
  the scripted plateau.
- **Gentle:** `speed −= round(min(speed − 50, 20) × 0.5)` — a fixed shave of up to
  10 off the plateau.
- **Moderate:** no jitter.

## Vacuum maintenance (suction control)

Independently of the speed pattern, autopilot periodically pulses the
**stroke-minus valve** to top up suction, at the level's interval:

| Setting      | baseDuration | speedMultiplier | interval |
| ------------ | -----------: | --------------: | -------: |
| Off          |            — |               — |        — |
| Low (little) |        200ms |             0.8 |   3000ms |
| High (more)  |        400ms |             0.6 |   2000ms |

Pulse length: `round(baseDuration × speedMultiplier / (speed/100 + 0.1))` —
inversely proportional to the speed at that moment, so slow strokes get long top-up
pulses (Low at speed 10: 800 ms; at speed 100: 145 ms) and fast strokes get short
ones. The valve opens, then closes after the computed duration.

## Manual override

- **Stroke − / Stroke +**: press-and-hold buttons. Press opens the corresponding
  valve, release closes it, with a **minimum open time of 300 ms** so a quick tap
  still gives a real pulse.
- **Finish**: pushes to full speed and the most intense settings, then holds there
  until you stop.
