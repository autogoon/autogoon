# TODO

Concrete, intended work. Speculative direction and design thinking lives in
[ROADMAP.md](./ROADMAP.md).

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
      **always** halts the device instantly and clears any "ignore Stop"
      state, overriding everything — on any tab, any algorithm, regardless of
      connection. A permanent safety floor. It matters most once ignore-Stop
      behaviours exist
      (see the cumming endings in the roadmap), but it's cheap and worth having
      regardless. Pick a word that's unambiguous and distinct from `stop`. Open:
      does it also fully reset the session, or just halt?
