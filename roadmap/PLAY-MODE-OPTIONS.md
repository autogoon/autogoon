# Play-mode options

Options which seem like they should belong to all play modes, grouped by when
they happen:

- **mid-play**: During the ride.
- **end-play**: The point you decide you want to cum — it drops into a finish
  mode and drives you toward climax.
- **after-play**: From the moment you start to cum.

Autopilot is a faithful implementation of the Vacuglide algorithm, but these
options are really additive, users can keep that faithful implementation by not
enabling any of the options.

## Mid-play — during the ride

- **Edge** — say **"edge"** → short cool-down → wait → build back up.
  - **Edge length** — how long the pause lasts before it ramps back: short
    teases vs. long denials.
    - User adjustable, with some randomisation? Danger of restarting too soon
      and causing an orgasm.
    - Maybe a voice command to resume, but then it's the same as Stop/Start.
    - There is this : https://github.com/nogasm/nogasm
  - A % chance it **ignores your "edge"**
    - **Does the chance grow?** Maybe it climbs the longer the session runs, it
      climbs with each "edge" you survive, or it's just a flat chance every
      time.
  - **How to best expose the options?** Could end up being a checkbox/slider
    nightmare!

## End-play — the run to finish

You signal you're ready to finish (a **"finish"** command) and the device goes
into a **finish mode** that drives you toward climax rather than riding on

Autopilot goes to full speed until you say stop, Goon goes to the end of its
ramp (so to the intensity percentage set.)

## After-play — from the moment you cum

Saying **"cumming"** splices in an after-play behaviour. The first cut is built
and shipped on Goon — wind-down, torture and the two ruins, drawn at random from
the ticked options, with torture and the ruins ignoring your voice once started
— see [modes/GOON.md](../modes/GOON.md). Ideas beyond it:

- **A torture period** — the first cut slams to 100% and holds "forever"; refine
  it with a torture duration (fixed, tunable, or randomly drawn), and decide
  what follows it.
- **Combined outcomes** — e.g. ruin, then torture.
- **Other play modes** — the options belong to every play mode eventually; Goon
  is just the first.
- **Configurable eject** — the first cut hard-codes speed 40 with the Stroke +
  valve open for 15 seconds; both want to be configurable at some point.
- **Configurable wind-down shape** — the current wind-down curve suits its
  author; others may want it longer, shorter, or shaped differently.

Any outcome that ignores **Stop** is backstopped by the always-on safe word.
