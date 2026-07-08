# Roadmap

Direction and design thinking — ideas that still need to be **thought through and
spec'd more firmly** before they become concrete tasks. Once one is settled, it
graduates to [TODO.md](./TODO.md).

## Stop vs Pause vs Reset

**Decide this first.** Several options below (torture, point of no return) ignore
**Stop**, and if Stop becomes Pause they'd need to ignore Pause instead — so the
transport model shapes them, and it should be settled before that work starts.

Right now the run button is **Start ⇄ Stop**, where Stop halts the device and the
next Start begins a **fresh** session (the program resets). Things to weigh:

- Should **Stop really mean Pause** — halt the device but keep the position — so
  Start **resumes** from there (Pause ⇄ Start/Resume) rather than restarting?
- If so, do we also want a separate **Reset** (command + button) to clear back to
  the beginning?
- Is a three-way Start / Pause / Reset too complicated for the UI and voice,
  versus a simple Start ⇄ Stop?

Note that **pause is mechanically the same as edge** — both halt the device and
hold the clock/position, then resume — so they'd likely share one implementation.
What differs is the _semantics and use case_ (a deliberate user "I need to take a
phone call" vs. the edging loop's timed tease), which is really what this
discussion is about, not the mechanism.

Stop/Pause behaviour can be impacted by the after-play options below — e.g.
torture carrying on through your plea to stop mid-cum, leaving the **safe word** as
the only way out.

## Algorithm options

Behaviours that layer on top of any algorithm, grouped by _when_ they happen:
**mid-play** (during the ride), **end-play** (the moment you cum), and
**after-play** (what happens next).

How much of this applies to **Autopilot** — a faithful Vacuglide recreation —
depends on the phase:

- **End-play / after-play** — good to add, and purely additive (no need for a
  separate "Autopilot + end-play" algorithm). They don't touch the drive, so the
  algorithm's feel is left intact — and they'd _improve_ it: Autopilot's only
  ending today is **Finish**, which just holds full speed until you stop it
  (torture-until-stop, not much of a finish). Real cumming endings are a clear
  upgrade. Autopilot has no `cumming` command yet — Goon and Groove do — so it
  would need one adding.
- **Mid-play** (edge) — a **departure** from the Vacuglide recreation: it
  interrupts the drive itself and changes the authentic feel. More questionable;
  probably leave Autopilot out of it.

### Mid-play — during the ride

- **Edge** — say **"edge"** → short cool-down → build back up. The classic edging
  loop, on your voice. Prototype against **Goon** (the favourite) first.
  - **Edge length** — how long the pause lasts before it ramps back: short teases
    vs. long denials.
  - **Point of no return** — a % chance it **ignores your "edge"** and just keeps
    building toward the finish. Two things to decide:
    - **How does the chance grow?** Options: it climbs the longer the session
      runs, it climbs with each "edge" you survive, or it's just a flat chance
      every time.
    - **Can the user change the numbers?** Whichever of those we build, we then
      decide whether the base chance (and how fast it climbs) is fixed in the code
      or adjustable in the settings.

    Worth prototyping a couple of these before deciding.

### End-play — the moment you cum

Saying **"cumming"** is where the ending gets chosen and spliced in. Groove and
Goon already have the seam — `beginCumming()` + `player.invalidateFuture()` drops
the future and splices a new tail — they just hardcode a single ending today (the
slow wind-down). The idea is to give "cumming" a choice of endings, picked one at
a time (turn on several and it picks at random):

- **Wind-down** — the slow glide to a stop (today's only ending).
- **Full throttle** — slams to 100% and drives you through it.
- **Ruin** — **cuts to zero.** You ask for release and it dies on you — denial at
  the exact moment you reach for it.

### After-play — what happens next

Rides on whatever the moment-ending was:

- **Stops** — the normal ending.
- **Torture** — **keeps going anyway** (overstimulation), ignoring **Stop/Pause**.
  This
  is why it isn't just another moment-ending: it _rides on_ one. Two standout
  pairings — **wind-down then torture**, where the gentle glide lulls you into a
  soft finish and torture kicks in exactly as you relax; and **ruin then torture**,
  where it cuts you to zero and then slams back to full throttle for a cold-start
  shock.

Any outcome that ignores **Stop/Pause** is backstopped by the always-on safe word
(a concrete task in [TODO.md](./TODO.md)).

## New algorithm candidates

Genuinely new drive _shapes_ (rarer than options):

- **Metronome** — follows a BPM you call out.
  - _Interesting stretch:_ detect BPM **from music** instead of calling it out.
    Beat/tempo detection is a solved-ish problem (onset detection → tempo
    estimation), but the catch is the keyword spotter: the mic already feeds vosk,
    so music near the mic would trigger false keywords off lyrics/vocals, and
    separating the user's voice from the music is hard. The likely escape is **two
    audio sources** — take BPM from the music (system/tab audio capture or an
    uploaded track via Web Audio) and keep keywords on the mic — so the two streams
    never have to be untangled.
- **Tide** — very long, slow swells.
