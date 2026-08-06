# The Goon play mode

An automatic, timeline-driven counterpart to the [Groove](./GROOVE.md) play
mode. Where Groove hands you Intensity, Dip variability and Timing variability
as manual knobs, Goon drives them for you over a program of a **session length
you choose**. It is a slow build that starts gentle and teasing and finishes as
a steady hold at the top. That is a "gooning" session, not deny-and-repeat
edging.

## Setup

Goon opens on its **setup view** (`Home › Goon`). Pick your **session length**
(10–120 minutes in 5-minute steps, default **30** — say `shorter` / `longer` to
step it), then hit **Play** (or say it). Setup also shows your **safe word**,
the same one Settings holds. You can read it, and change it, before you play.
Play locks your choices in and takes you down a level (`Home › Goon › Play`) to
the session itself, with the transport, preview, stroke and intensity controls.

Setup is not changeable mid-play. **Reset** restarts the session from time 0,
staying put, and puts Intensity back to 50 and the time factor back to 1×.
`exit` — or the breadcrumb — climbs back up to setup, and from there to home,
but not mid-session. Stop only pauses; it takes Reset as well before either will
move. Play needs the device connected, like Start.

The build **scales to fit** whatever length you choose. A 15-minute Goon
compresses the whole ramp, an hour-long one stretches it; the curves in
[The build](#the-build) play out as fractions of your session. Times in this
document describe the default 30-minute build.

## The build

It **is** Groove with its knobs driven automatically. The dip is always Groove's
raw pattern **100 → floor → 100**. A **position** runs from 0 to the end of the
session, and the curves are sampled at that position:

- **Build speed** — Groove's Intensity knob, driven for you — eases from **25 →
  100** across the whole session, a slow start that accelerates toward the
  finish.
- **Dip variability** winds down from Groove's _high_ to _off_ over the **first
  five-sixths** of the session (25 minutes of a 30-minute build). Early on a dip
  can plunge anywhere from a shallow nudge to a dead stop, redrawn every cycle
  and weighted toward the deep end. By the end of that stretch every dip is the
  standard, predictable `100 → 60`.
- **Timing variability** winds down from Groove's _high_ (**75%**) to _off_
  across the **whole session**. Early legs can be cut to a quarter of their
  length. The pace lurches. Only the very last legs take their full ten seconds.

Then the **final sixth is a taper** (the last 5 minutes of a 30-minute build).
The dip floor rises from 60 to 100. The dips shrink away to nothing and the
program arrives at a flat hold at the top. The timing is still slackening off
through all of that, and the dips keep a little unevenness right up to the point
where they vanish.

## Intensity

**Intensity** (0–100, default **50**) is a final ceiling on the whole thing. The
build is fixed, and intensity scales evenly what reaches the device. At the
default **50**, the 25 → 100 build plays out as roughly **12 → 50%** on the
device; turn it down further when you're more sensitive. It takes effect live.

## Teases

One automatic tease: a single **10-second stroke-minus pulse** right at session
start. It is separate from the manual Stroke ± / `up`/`down` controls.

## The finish and cumming

At the end of the session the build reaches the top and **holds there** until
you end it. `finish` jumps straight to that hold.

`cumming` is the actual send-off, and what it does is set by the **After-play**
card in setup. Tick any of the outcomes; at the cumming point one is drawn at
random from the ticked set. At least one must be ticked before you can play, and
your ticks are remembered on this device:

- **Wind-down** — the device eases off from a moderate pace down to a standstill
  over about ten seconds, the strokes shortening as it goes, then rests.
- **Torture** — straight to full speed and held there. Indefinitely.
- **Ruin: stay in** — stops dead, leaving you seated with the vacuum seal held.
- **Ruin: eject** — drives the toy to push you out (a steady pace with the
  stroke+ valve held open for fifteen seconds), then rests. Building the
  ejecting force takes a second or two of movement. That is stimulation at
  exactly the wrong moment, with voice-recognition lag on top. It can tip into a
  finish instead of a ruin. A ruin is timing-dependent even by hand.

**Torture and both ruins take no input once they start.** Every control greys
out and every voice command stops being heard. The safe word still works,
always; once it has stopped the device, Reset and Start return.

## Time dilation

**`faster` / `slower`** stretch or compress the build from that point on (~5%
per step, roughly 0.25×–4×). They don't jump the position; they change how fast
you move through the build from here. The device's own stroke rhythm stays
real-time, and only the build/variability curve compresses or stretches. The
Timeline card shows the current factor (e.g. `1.20×`).

## Voice control

In setup:

- `shorter` / `longer` — step the session length down/up.
- `gentle` / `torture` / `stay` / `eject` — tick or untick that after-play
  outcome.
- `play` — lock the setup in and ready the session.

During play, on top of the transport words Goon, Groove and Autopilot share (see
[MODES.md](../MODES.md)):

- `forward` / `back` — jump the position ±1 minute. `forward` stops at the end
  of the session.
- `finish` — jump to the end-of-session hold.
- `faster` / `slower` — dilate time ±5% from this point on.
- `more` / `less` — step Intensity up/down.
- `cumming` — trigger the drawn after-play (see
  [The finish and cumming](#the-finish-and-cumming)).

See [ARCHITECTURE.md](../ARCHITECTURE.md) for how the play mode is built.
