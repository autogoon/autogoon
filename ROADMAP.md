# Roadmap

Direction and design thinking — ideas that still need to be thought through and
specified more firmly before implementation.

Some ideas might need some prototyping and testing to work out how well they
work.

## Improve keyword detection

If watching videos, it's common for them to trigger keywords in the background,
which is a problem. Does Vosk support any options which can require a certain
volume, or clarity? Are there other KWS options which rely on voice training so
it can recognise the user's voice and ignore background noise?

## Algorithm options

Options which seem like they should belong to all algorithms, grouped by when
they happen:

- **mid-play**: During the ride.
- **end-play**: The point you decide you want to cum — it drops into a finish
  mode and drives you toward climax.
- **after-play**: From the moment you start to cum.

Autopilot is a faithful implementation of the Vacuglide algorithm, but these
options are really additive, users can keep that faithful implementation by not
enabling any of the options.

### Mid-play — during the ride

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

### End-play — the run to finish

You signal you're ready to finish (a **"finish"** command) and the device goes
into a **finish mode** that drives you toward climax rather than riding on

Autopilot goes to full speed until you say stop, Goon goes to the end of its
ramp (so to the intensity percentage set.)

### After-play — from the moment you cum

Saying **"cumming"** splices in an after-play behaviour.

- **Wind-down** — Simulate a penetrative orgasm, a slow, comfortable decrease
  (like Goon and Groove implement in `beginCumming()`).
- **Torture** — Speed goes straight to 100%, and ignore the Stop command.
- **Ruin** — There are two possible options here :
  - **Stay-in** — stop the device, leaving you still seated in the toy. The
    vacuum seal stays, so there's still passive sensation — a softer, less
    complete ruin.
  - **Eject** — drive the toy to physically push you out, removing all contact
    — a more complete ruin
    - However, generating that ejecting force takes a second or two of movement,
      which is stimulation at exactly the wrong moment; with voice-recognition
      lag on top (~1s between saying "cumming" and the device reacting), it may
      fail to cut stimulation in time and tip into a finish instead of a ruin.
    - Worth noting a ruin is timing-dependent anyway — even by hand it doesn't
      always land — so some unreliability here may be acceptable rather than a
      flaw to design out.

It might be an option to combine these into a single after-play, like ruin but
then torture.

How to best expose the options? Could end up being a checkbox/slider nightmare!

Any outcome that ignores **Stop** is backstopped by the always-on safe word
(a concrete task in [TODO.md](./TODO.md)).

## New algorithm candidates

- **Metronome** — follows a BPM you call out.
  - Consider detecting BPM from music instead of calling it out. The mic already
    feeds vosk, so music near the mic would trigger false keywords off
    lyrics/vocals, and separating the user's voice from the music is hard. The
    likely escape is **two audio sources** — take BPM from the music
    (system/tab audio capture or an uploaded track via Web Audio) and keep
    keywords on the mic — so the two streams never have to be untangled.
- **Tide** — very long, slow swells.
