# Roadmap

Ideas that still need thinking through and specifying before implementation.
Some need prototyping first. The divide against the other files is in
[CLAUDE.md → Documentation](./CLAUDE.md#documentation).

Each idea lives in its own file under [`roadmap/`](./roadmap/); this page is the
index.

- [Other devices, and no device](roadmap/OTHER-DEVICES.md) — support strokers
  beyond the Vacuglide, and no device at all: chat to the companions and use
  your hand. A control prompt per device, and the open question of whether a
  persona can be device-neutral.
- [Improve keyword detection](roadmap/KEYWORD-DETECTION.md) — stop sound from
  the room (a TV playing) running voice commands: gating a detection on input
  level or confidence, or a keyword spotter trained on the user's voice.
- [Play-mode options](roadmap/PLAY-MODE-OPTIONS.md) — options every play mode
  should share, grouped by when they happen: mid-play (edge), end-play (the run
  to finish) and after-play (from the moment you cum).
- [Cumming patterns](roadmap/CUMMING-PATTERNS.md) — make what happens when you
  cum a defined, shareable pattern rather than bespoke code, so any play mode
  can use one and a companion can pick.
- [Inference library](roadmap/INFERENCE-LIBRARY.md) — how a companion handles a
  library too big to curate: they ask for a picture in words and the app finds
  it, from descriptions and a summary generated offline. The pack format and the
  two tools a companion calls have shipped; what goes in a description and how
  the search ranks have not.
- [Goonpack kit](roadmap/GOONPACK-KIT.md) — move pack authoring into the app:
  leaf through a pack's pictures fixing captions, edit its manifest and persona,
  and build it, instead of scripts and a text editor.
- [Persona programs](roadmap/PERSONA-PROGRAMS.md) — a companion's chat diverges
  by persona and their program doesn't. Drive the Companions intensity and
  variety knobs from persona traits, once it's settled which traits are code at
  all rather than prompt.
- [The safe word](roadmap/SAFE-WORD.md) — it stops the toy and nothing else
  today. It should also cut the companion off and then let them react to it in
  character, which means telling them it happened.
- [Context compaction](roadmap/CONTEXT-COMPACTION.md) — a companion's thread
  only grows and is re-sent whole every turn, and the browser's storage quota is
  the limit it reaches before the model's window.
- [Theming](roadmap/THEMING.md) — the app has a light theme and a mostly
  hard-coded palette, and nothing reconciles them. Either the palette moves onto
  tokens or light mode goes; today a colour that fails in one theme is caught
  only by eye.
- [Freestyle](roadmap/FREESTYLE.md) — a play mode with no program at all: speed
  and the stroke valves, driven by hand.
- [Rounds](roadmap/ROUNDS.md) — play-mode candidate: the only one to continue
  past the first orgasm, through an overstim bridge and the refractory lull to a
  rebuild, and round again.
- [Wave / Ballooning](roadmap/WAVE-BALLOONING.md) — play-mode candidate: a long
  high plateau where speed dips and returns without dropping far; may be no more
  than a floor knob on Groove.
- [Lasting-longer training](roadmap/LASTING-LONGER.md) — play-mode candidate:
  structured stop-start (Semans) practice, with the research behind it.
