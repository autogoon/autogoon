# The Autopilot algorithm

A recreation of `fun.autoblow.com/vacuglide/autopilot`. Reverse-engineered from
the original app's client bundle (`autopilot-Krw_IcWx.js`); the port in
`src/lib/vacuglide-autopilot-engine.ts` is faithful, including constants. The whole thing
runs client-side in the browser — the "autopilot" is just a timer loop issuing
`target-speed` (and occasionally valve) commands.

For how it plugs into the rest of the app (the engine/hook/panel split, the
shared device layer, the algorithm runner), see [ARCHITECTURE.md](./ARCHITECTURE.md).

## The mystery script

When autopilot (re)configures, it generates a **mystery script**: a long random
sequence of `{speed, at}` waypoints.

- There are **8 hand-authored pattern templates** (see `PATTERN_TEMPLATES`):
  staircases up/down, gentle low waves, square waves between low and max,
  rising peaks with rest dips, repeated max plateaus with shrinking valleys,
  and a sustained high plateau. Template speeds span 5–100 with durations of
  2–10s per step.
- Script generation picks **10 templates uniformly at random** (repeats
  allowed) and concatenates them, so a run is roughly 10–60 minutes of
  waypoints. When playback reaches the end, it **loops back to the start** of
  the same script.
- Each template step is transformed by the two settings below before being
  appended.

So "when does it go faster/slower and by how much" is: **the shape comes from
the randomly-chosen templates; the settings only rescale speeds and stretch or
shrink duration.**

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

Edge control also adds **per-send jitter** at playback time, again only when
the (scaled) speed is above 70:

- **Intense:** `speed += random(0 .. min(100 − speed, 15))` — random surges
  above the scripted plateau.
- **Gentle:** `speed −= round(min(speed − 50, 20) × 0.5)` — a fixed shave of up
  to 10 off the plateau.
- **Moderate:** no jitter.

## Playback loop

A 100ms `setTimeout` tick advances a clock (`currentTime += 100`). When the
clock passes the next waypoint's `at`, the (jittered) speed is sent via
`PUT /vacuglide/target-speed`. Commands therefore go out only when the script
has a transition — every few seconds, not every tick.

Changing intensity or edge control **regenerates the script and restarts it
from position 0** (a fresh random template selection). Pause sends
`target-speed/stop` but keeps the script position; Start resumes by re-sending
the last waypoint's speed.

## Vacuum maintenance (suction control)

Independently of the speed script, autopilot can periodically pulse the
**stroke-minus valve** to top up suction. When a speed command is sent, if the
setting is enabled and at least `interval` ms have passed since the last pulse:

| Setting      | baseDuration | speedMultiplier | interval |
| ------------ | -----------: | --------------: | -------: |
| Off          |            — |               — |        — |
| Low (little) |        200ms |             0.8 |   3000ms |
| High (more)  |        400ms |             0.6 |   2000ms |

Pulse length: `round(baseDuration × speedMultiplier / (speed/100 + 0.1))` —
inversely proportional to current speed, so slow strokes get long top-up pulses
(Low at speed 10: 800ms; at speed 100: 145ms) and fast strokes get short ones.
The valve opens, then closes after the computed duration.

Note the pulse check only runs when a speed command happens to be sent, so the
`interval` is a floor, not an exact period.

## Manual override

- **Stroke − / Stroke +**: press-and-hold buttons. Press opens the
  corresponding valve (`valveState: true`), release closes it, with a
  **minimum open time of 300ms** so a quick tap still gives a real pulse.
- **Finish ME**: stops the autopilot loop and timers, closes both valves, and
  sets **speed 100**, which then just stays there (no timer running) until you
  pause or the state is changed.

## Safety behaviour in this recreation

If the page is closed/hidden while autopilot is running, a keepalive
`target-speed/stop` request is fired (`pagehide` handler) so the device doesn't
keep running at the last commanded speed. The original app equivalently calls
`stop()` when its route unmounts.
