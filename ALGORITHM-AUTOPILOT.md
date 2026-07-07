# The Autopilot algorithm

A faithful recreation of Autoblow's own Vacuglide autopilot — the official
"hands-off" mode. Reverse-engineered from the original app's client bundle
(`autopilot-Krw_IcWx.js`) and rebuilt to run entirely in your browser, faithful
down to its constants. Start it and let it drive.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how it plugs into the app.

## The mystery script

Autopilot plays a **mystery script** — it stitches together a long, unpredictable
run from **8 hand-crafted patterns**, picking 10 of them at random (repeats
allowed) and looping, so you never quite know what's coming. The patterns:

1. **Slow full staircase** — climbs step by step from a crawl up to full and back
   down, lingering ~5 s on each step.
2. **Gentle half staircase** — the same shape but only up to about half speed, and
   slower still.
3. **Medium / max / low** — holds at medium, jumps to full, drops to a near-stop,
   over and over.
4. **Square wave** — a hard on/off between a crawl and full speed, nothing in
   between.
5. **Rising peaks** — a low dip before each of a rising series of peaks (roughly
   50 → 60 → 70 → 80 → 90 → 100).
6. **Gentle low waves** — small rolling waves that stay down in the slow range.
7. **Max plateaus, shrinking rests** — repeated bursts to full speed with the rest
   valleys between them getting ever shorter.
8. **Quick ramp to a high hold** — a fast climb to near-full, then a sustained high
   plateau.

A run is roughly 10–60 minutes before it loops. Two settings shape it.

## Intensity → how hard

How hard it works you, from a gentle **Warmup** through **Low** and **Medium** to a
full-on **High**. Each template speed is remapped from its 5–100 range into the
level's range:

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
stretches out the recovery valleys; **Intense** holds you at the peaks — with
little random surges above them — and cuts the recovery short; **Moderate** sits in
between. Under the hood it's a duration multiplier on each step, keyed off the
**template** speed:

| Edge     | plateau (speed > 70) | cooldown (speed < 30) |
| -------- | -------------------: | --------------------: |
| Gentle   |                 ×0.5 |                    ×2 |
| Moderate |                   ×1 |                    ×1 |
| Intense  |                 ×1.5 |                  ×0.5 |

Steps between 30 and 70 are never warped. Intense also adds random surges above the
plateau (`speed += random(0 .. min(100 − speed, 15))`); Gentle shaves up to 10 off
it (`speed −= round(min(speed − 50, 20) × 0.5)`); Moderate leaves it alone.

## Vacuum maintenance (suction control)

Independently of the strokes, autopilot periodically pulses the **stroke-minus
valve** to top up the suction so the seal stays firm — **Off**, **Light**, or
**Heavy**:

| Setting      | baseDuration | speedMultiplier | interval |
| ------------ | -----------: | --------------: | -------: |
| Off          |            — |               — |        — |
| Low (little) |        200ms |             0.8 |   3000ms |
| High (more)  |        400ms |             0.6 |   2000ms |

Pulse length: `round(baseDuration × speedMultiplier / (speed/100 + 0.1))` —
inversely proportional to the speed at that moment, so slow strokes get long top-up
pulses (Light at speed 10: 800 ms) and fast strokes short ones.

## Manual override

- **Stroke − / Stroke +**: press-and-hold buttons. Press opens the corresponding
  valve, release closes it, with a **minimum open time of 300 ms** so a quick tap
  still gives a real pulse.
- **Finish**: pushes to full speed and the most intense settings, then holds there
  until you stop.
