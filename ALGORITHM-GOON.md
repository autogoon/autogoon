# The Goon algorithm

An automatic, timeline-driven counterpart to the
[Groove](./ALGORITHM-GROOVE.md) algorithm. Where Groove hands you Intensity, Dip
variability and Timing variability as manual knobs, Goon drives them for you over
a program of a **session length you choose**: a slow build that starts gentle and
teasing and finishes as a steady hold at the top. It models a long, unhurried
arousal ramp to a controlled climax — a "gooning" session, not deny-and-repeat
edging.

## Setup

Goon opens on its **setup view** (`Home › Goon`): pick your **session length**
(10–120 minutes in 5-minute steps, default **30** — say `shorter` / `longer` to
step it), then hit **Play** (or say it). Play locks your choices in and takes
you down a level (`Home › Goon › Play`) to the session itself — the transport,
preview, stroke and intensity controls. Setup is deliberately not changeable
mid-play: **Reset** restarts the session from time 0 (staying put), while
`exit` — or the breadcrumb — climbs back up to setup, and from there to home.
Play needs the device connected, like Start.

The build **scales to fit** whatever length you choose — a 15-minute Goon
compresses the whole ramp, an hour-long one stretches it, and either way the
curves below play out as fractions of your session. Times in this document
describe the default 30-minute build.

## The build

It **is** Groove with its knobs driven automatically. The dip is always Groove's
raw pattern **100 → floor → 100**. A **position** runs from 0 to the end of the
session, and the curves are sampled at that position:

- **Speed** eases from **25 → 100** across the whole session — a patient start
  that accelerates toward the finish.
- **Dip variability** winds down from Groove's _high_ to _off_ over the **first
  five-sixths** of the session (25 minutes of a 30-minute build). Early on a dip
  can plunge anywhere from a shallow nudge to a dead stop, redrawn every cycle and
  weighted toward the deep end; by then every dip is the standard, predictable
  `100 → 60`.
- **Timing variability** winds down from Groove's _high_ (**75%**) to _off_ across
  the **whole session**. Early legs can be cut to a quarter of their length, so
  the pace lurches; only the very last legs take their full, unhurried ten seconds.

Then the **final sixth is a taper** (the last 5 minutes of a 30-minute build): the
dip floor rises from 60 to 100, so the dips shrink away to nothing and the
program arrives at a flat hold at the top. The
timing is still slackening off through all of that, so the dips keep a little
unevenness right up to the point where they vanish.

So it opens with deep, ragged, unpredictable swings that could stop you dead,
settles into a steady `100 → 60` bob that gradually slows, and then flattens out
entirely.

## Intensity

**Intensity** (0–100, default **50**) is a final ceiling on the whole thing — the
build is fixed and intensity just scales, evenly, what actually reaches the
device. At the default **50**, the 25 → 100 build plays out as roughly
**12 → 50%** on the device; turn it down further when you're more sensitive. It
takes effect live, so a change lands at once.

## Teases

One automatic tease: a single **10-second stroke− application** right at session
start. It's separate from the manual Stroke ± / `up`/`down` controls.

## The finish and cumming

At the end of the session the build reaches the top and **holds there** until you
end it. `finish` jumps straight to that hold — the top of the build, waiting for
you.

`cumming` is the actual send-off: the device eases off in a slow, deliberate glide
from a moderate pace down to a standstill over about fifteen seconds — the strokes
shortening as it winds down — then rests. It's an unhurried, drawn-out finish
rather than a frantic pump. Fair warning: this is simply how the author likes to
cum, and it won't be to everyone's taste — read it as one opinion of how to end a
session, not the only way.

## Time dilation

**`faster` / `slower`** stretch or compress the journey from that point on
(~5% per step, roughly 0.25×–4×). They don't jump the position; they change how
fast you move through the build (and the tease schedule) from here. The device's
own stroke rhythm stays real-time; only the build/variability curve compresses or
stretches. The Timeline card shows the current factor (e.g. `1.20×`).

## Voice control

In setup:

- `shorter` / `longer` — step the session length down/up.
- `play` — lock the setup in and ready the session.

During play:

- `forward` / `back` — jump the position ±1 minute.
- `finish` — jump to the end-of-session hold.
- `faster` / `slower` — dilate time ±5% from this point on.
- `more` / `less` — step Intensity up/down.
- `cumming` — trigger the wind-down.
- plus the shared stroke `up` / `down` words — lengthen (`up`) or shorten
  (`down`) the stroke by hand.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the algorithm is built — the
engine/player split, the event model, and how Goon's position maps to the Player's
clock (so `forward`/`back`/`finish`/`faster`/`slower` are just the Player moving or
dilating that clock).
