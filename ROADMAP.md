# Roadmap

Direction and design thinking — ideas that still need to be thought through and
specified more firmly before implementation. Some need prototyping first. The
divide against the other files is in
[CLAUDE.md → Documentation](./CLAUDE.md#documentation).

Each idea lives in its own file under [`roadmap/`](./roadmap/); this page is the
index.

- [Other devices, and no device](roadmap/OTHER-DEVICES.md) — support strokers
  beyond the Vacuglide, and no device at all: chat to the companions and use
  your hand. A control prompt per device, and the open question of whether a
  persona can be device-neutral.
- [Improve keyword detection](roadmap/KEYWORD-DETECTION.md) — stop background
  media (videos) triggering voice commands: volume/clarity gating, or a KWS
  matched to the user's voice.
- [Play-mode options](roadmap/PLAY-MODE-OPTIONS.md) — options every play mode
  should eventually share, grouped by when they happen: mid-play (edge),
  end-play (the run to finish) and after-play (from the moment you cum).
- [Cumming patterns](roadmap/CUMMING-PATTERNS.md) — make what happens when you
  cum a defined, shareable pattern rather than bespoke code, so any play mode
  can use one and a companion can pick.
- [Inference library](roadmap/INFERENCE-LIBRARY.md) — how a companion handles a
  library too big to curate: they ask for a picture in words and the app finds
  it, from descriptions and a summary generated offline. The plumbing ships; the
  open questions behind it are what this covers.
- [Goonpack kit](roadmap/GOONPACK-KIT.md) — move pack authoring into the app:
  leaf through a pack's pictures fixing captions, edit its manifest and persona,
  and build it, instead of scripts and a text editor.
- [Persona programs](roadmap/PERSONA-PROGRAMS.md) — a companion's chat diverges
  by persona and their program doesn't. Map their traits onto Groove's knobs,
  once it's settled which traits are code at all rather than prompt.
- [The safe word](roadmap/SAFE-WORD.md) — it stops the toy and nothing else
  today. It should also cut the companion off and then let them react to it in
  character, which means telling them it happened.
- [Context compaction](roadmap/CONTEXT-COMPACTION.md) — a companion's thread
  only grows and is re-sent whole every turn, and a few dozen searches in it
  reach the browser's storage quota before the model's window.
- [Freestyle](roadmap/FREESTYLE.md) — a mode with no program at all: the raw
  device controls (speed, stroke, valves), you drive.
- [Rounds](roadmap/ROUNDS.md) — play-mode candidate: the only one to continue
  past the first orgasm — overstim bridge, refractory lull, rebuild, repeat.
- [Wave / Ballooning](roadmap/WAVE-BALLOONING.md) — play-mode candidate: a long
  high plateau with rolling swells; may just be a floor knob on Groove.
- [Lasting-longer training](roadmap/LASTING-LONGER.md) — play-mode candidate:
  structured stop-start (Semans) practice, with the research behind it.
