# TODO

Concrete, intended work. Speculative direction and design thinking lives in
[ROADMAP.md](./ROADMAP.md).

The shared **Player** refactor (done) was the groundwork for the first feature
below — the one we set aside to build it. Because a program and a clock now exist
independently of "playing," idle interaction is straightforward to add.

## Voice control & enablement when idle

The theme: **voice should drive any control that's currently usable in the UI**, on
the tab you're looking at — not only while an algorithm is running.

- [ ] **Enable on connection, not on run.** All UI controls are disabled while the
      device is disconnected; once connected, the selected tab's controls are usable
      whether or not the algorithm is running.
      *(Today: the sliders / segmented controls are never disabled, and the Stroke
      card gates on `isPlaying`.)*
- [ ] **Voice follows the enabled controls.** If a control is enabled, its spoken
      command works — including while idle.
      *(Today: while idle, a spoken word is only ever treated as an algorithm switch
      word.)*
- [ ] **Stroke − / Stroke + / Cumming / Finish work while idle** (connected, not
      running). The device layer already supports manual strokes when idle; the UI
      needs to enable them, and Cumming / Finish need to run against the idle player.
- [ ] **Listen only for the active tab's commands.** The recognizer grammar =
      the active tab's algorithm commands + the globals (`connect` / `start` /
      `stop`, plus the switch words while idle) — so you never respond to another
      tab's words.
      *(Today: the grammar is the **running** algorithm's commands.)*

## Nice-to-have (unlocked by the same work)

- [ ] **Idle sparkline preview.** Show the upcoming program at the current position
      while paused, and have Start begin from there instead of resetting to 0. (The
      Player already keeps its clock and program while paused.)
- [ ] **Build the program on tab mount, not on Start.** Generate the initial
      program when the tab mounts (the algorithms already mount at the top of the
      tree) rather than when Start is pressed — so the preview is populated
      immediately and you can scrub/adjust before playing; Start then just begins
      consuming the already-built program.

## Visualisation

- [ ] **Indicate scheduled valve operations on the timeline.** The visualisation
      shows the upcoming speed curve but not the scheduled stroke − / stroke +
      (valve) events. Mark them on the timeline so the stroke changes are visible
      coming up, not just the speed.

## Algorithm settings

- [ ] **Goon: expose session length.** Goon's run length is the hard-coded
      30-minute `PROGRAM_MS`. Make it a setting, with the build **scaling to fit** —
      a 15-min Goon compresses the ramp, a 45-min one stretches it — and the ramp
      still driving toward the finish as the clock runs out. A per-Goon option, not
      a cross-cutting one.

## Safety

- [ ] **Safe word — an always-on hard stop.** A **user-defined** word that
      **always** halts the device instantly and clears any "ignore Stop/Pause"
      state, overriding everything — on any tab, any algorithm, regardless of
      connection. A permanent safety floor. It matters most once ignore-Stop/Pause
      behaviours exist
      (see the cumming endings in the roadmap), but it's cheap and worth having
      regardless. Pick a word that's unambiguous and distinct from `stop`. Open:
      does it also fully reset the session, or just halt?
