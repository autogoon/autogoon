# Developing Autogoon

How to run Autogoon locally and contribute changes. For how the app is put
together internally — the program/player model, the engine/panel split, the
shared device layer and single Player, and the keyword spotter — see
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Running locally

```sh
npm install
npm run dev      # Next dev server on http://localhost:8931 (bound to 0.0.0.0)
```

Other scripts:

- `npm run build` — production build (also runs `tsc`, so it catches RSC/Next
  issues the dev server tolerates).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint --max-warnings 0`.
- `npm run format` — Prettier over `src`, `tests` and the root config/docs.
- `npm test` — Jest unit tests.
- `npm run test:e2e` — Playwright end-to-end tests (see [Testing](#testing)).

The ~40MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is
fetched by the page on load and cached by the browser; nothing else is needed
offline.

## Contributing

- **Branch off `main`** — never commit to `main` directly. One branch/PR per piece
  of work.
- **Run the tests** (`npm test` and `npm run test:e2e` — see
  [Testing](#testing)). They're a floor, not the whole story: the app drives
  physical hardware, so behaviour changes still want the app run and the
  affected flow driven in the browser — not just typecheck and build.
- **Open a pull request** — push your branch (`git push -u origin <branch>`) and
  open a PR against `main` with `gh pr create` (the GitHub CLI), or the "Compare &
  pull request" prompt GitHub shows after you push.
- **Update [CHANGELOG.md](./CHANGELOG.md)** for every notable change — user-facing
  ones described by what the app does, internal ones (refactors, etc.) by what
  changed. One line per change, newest first, grouped by date, tagged `feature` /
  `enhancement` / `bug` / `internal` (in that order within a day), linking the PR.
- **Before it's reviewed** — `npm run typecheck`, `lint`, and `format` must all
  pass with **zero warnings** (typecheck and lint produce no output; fix every
  warning, not just the ones your change introduced). Individual commits needn't be
  spotless — the PR as a whole must be clean — and commit anything `format`
  reformats.
- **Adding an algorithm?** See [Adding an algorithm](#adding-an-algorithm) below
  for the full checklist.

## Testing

Two layers, both local-only for now (no CI):

- **Unit tests** — `npm test` (Jest via `next/jest`, node environment). They live
  next to what they test (`src/**/*.test.ts`) and cover pure logic: engine
  generation contracts, the device client's rate-limit accounting. Import from
  `@jest/globals` rather than relying on globals.
- **End-to-end tests** — `npm run test:e2e` (Playwright, in `tests/e2e/`). Every
  spec runs on real Chromium, Firefox **and** WebKit; the config starts the dev
  server on :8931 (or reuses one already running).

The voice test is the reason the E2E layer exists: it proves the whole voice
pipeline — AudioWorklet capture, vosk's WASM recognizer, grammar and command
routing — works in each engine. Only the microphone _hardware_ is faked:
`getUserMedia` is stubbed (via `MediaDevices.prototype` — instance assignment
doesn't stick in WebKit) to return a WebAudio-built `MediaStream`, and the test
plays a committed wav of a synthesized switch word into it once, then asserts
the app heard it and switched tabs.

Two hard-won details, should you write more voice tests:

- The stub keeps a zero-value `ConstantSourceNode` feeding the stream at all
  times. Firefox only produces frames while something feeds the destination
  node, and vosk needs trailing silence to endpoint an utterance — without it
  the word is heard but never finalised.
- The test clicks the page **before** the audio pipeline comes up: in real use
  the mic-permission click grants the user activation that lets Firefox/WebKit
  run the app's `AudioContext`; the stub bypasses the prompt, so the test must
  supply the activation itself.

Fixtures are committed under `tests/fixtures/`; regenerate them with
`tests/fixtures/generate.sh` (macOS only — it uses `say`).

The first time the suite runs a given browser, macOS asks whether to allow it
to use the microphone — approve it once per browser and it won't ask again.
(The tests never use the real mic, but the browsers still request the
permission.)

## Adding an algorithm

An algorithm is a self-contained pair — an **engine** (event generation, no React,
no device) and a **panel** (the React surface that owns the engine and drives the
shared Player) — registered in `src/app/page.tsx`. Read the engine/panel split in
[ARCHITECTURE.md](./ARCHITECTURE.md) first.

**Copy an existing algorithm as your starting point.** `goon-engine.ts` +
`goon-panel/` exercise the full feature set (an automatic build curve, a setup
view with per-concern option cards, a live-scaled magnitude knob, valve teases,
time dilation, and a bespoke `cumming` wind-down), so Goon is the richest
template. For a simpler _manual-knob_ mode, `groove-engine.ts` +
`groove-panel.tsx` are the leaner model.

### The steps

1. **Engine** — `src/lib/algorithms/<name>-engine.ts`, a plain `AlgorithmEngine`
   (no React, no device).
   - Implement the four methods from
     [`src/lib/program.ts`](./src/lib/program.ts): `reset`, `generateSpeed`,
     `generateValves`, `scale`. That interface is the contract and the
     best-commented file to read first.
   - Engines are **self-contained** — they never import from each other. If you
     reuse another algorithm's pattern (as Goon reuses Groove's dip), **duplicate**
     the helper, don't share it.
2. **Panel** — `src/components/algorithms/<name>-panel.tsx` (or a
   `<name>-panel/` directory with the panel in `index.tsx`, once it has enough
   pieces — Goon splits its setup option cards out this way). Copy Goon's or
   Groove's structure; what's algorithm-specific is only your knob cards and their
   commands. Whether an algorithm has a **setup view** before its play view is
   the panel's own choice — Goon has one, Groove and Autopilot don't. The parts
   to copy:
   - a `useRef` engine — **stable identity matters**: the Player identifies the
     active source by reference, so never re-create it (no `useMemo` with deps);
   - `isCurrent` / `state` derived from the Player view;
   - an effect that arms the preview when the tab becomes active;
   - `start` / `stop` / `reset`, and a `Command[]` handed to `useVoiceCommands`;
   - the shared scaffolding: `ListeningFor`, `SessionControls`, `Sparkline`,
     `StrokeCard`, `LogCard`.

   Two things to copy deliberately:
   - **Reset is two layers.** Your `reset` restores the knobs' React state and
     their engine defaults, then re-arms — the Player rebuilds the program from the
     start and calls `engine.reset()` to clear transient state (e.g. a pending
     `cumming`).
   - **Endings belong to the panel, not `StrokeCard`** (which is just the shared
     stroke ± buttons). If your algorithm has an ending, render a `FinishButton`
     and/or a `CummingButton` — **Finish** (a _pre_-ending: reach/hold the climax
     point) and **Cumming** (the send-off) are distinct actions. Have both, one, or
     neither.

3. **Register it in `src/app/page.tsx`** — three edits:
   - import the panel;
   - add a `TABS` entry with **`algorithm: true`** (this one flag is what puts the
     id into `ALGORITHM_TABS`, so the voice switch word and the tab lock both work
     — miss it and the tab renders but neither does, with no type error to warn
     you);
   - render `<YourPanel …>` in its `hidden`-toggled `<div>` alongside the others,
     passing `active={tab === "<name>" || runningTab === "<name>"}`.
4. **User-facing copy:**
   - add `ALGORITHM-<NAME>.md` (high-level and experiential, like the others — not
     an implementation spec), and link it from `README.md` (the mode list and the
     Documentation list);
   - update the in-app intro in `src/components/settings-panel.tsx`, which hardcodes
     both the mode list and the spoken switch words.
5. **Changelog** — add a `feature` line to [CHANGELOG.md](./CHANGELOG.md).

### Which knob-change method to call

When a knob changes, how it reaches the device depends on _what_ changed. Pick by
where the change lives (see the `Player` methods in
[`src/lib/player.ts`](./src/lib/player.ts)):

| Knob affects…                         | Method                      | Example                                |
| ------------------------------------- | --------------------------- | -------------------------------------- |
| A **magnitude** applied in `scale()`  | `device.refresh()`          | Goon Intensity, Groove Speed           |
| The **shape** of the speed script     | `device.invalidateFuture()` | Groove Variability; `cumming`/`finish` |
| **Valves only**, over unchanged speed | `device.invalidateValves()` | Autopilot Vacuum Maintenance           |

The program is generated once in raw **pattern space** (0–100); the Player runs
each event through the engine's `scale()` at send time, applying the knob's current
value. So a **magnitude** knob changes nothing about the program — `refresh()` just
re-sends the current event at the new scale, and every future event is scaled as
it plays.

This is a deliberate optimisation, and it matters for _feel_: regenerating instead
(`invalidateFuture()`) would build a **different** program, because generation has
random elements (timing jitter, dip variation) — so a magnitude change would jump
you onto a fresh pattern rather than smoothly rescaling the one you're already
feeling. Scaling keeps the exact same shape, just louder or quieter.

Reach for `invalidateFuture()` only when the **shape** genuinely changed: it drops
and rebuilds the not-yet-played tail from the new engine state (accepting that the
random tail is now a different draw). `invalidateValves()` re-lays only the valve
overlay, leaving the speed backbone — and its randomness — intact.

### `generateSpeed` pitfalls

The contract (`program.ts`) spells these out, but they're the easy ones to get
wrong:

- Each call must return events extending **past `fromTime`**. A batch whose last
  event lands at or before `fromTime` makes no progress, so the Player's look-ahead
  loop spins. (Emitting in whole cycles isn't required — it's just convenient, so
  each call resumes from a clean boundary to append the next batch.)
- Return **`[]` to park** — nothing more to play until a knob changes (this is how
  Goon's `cumming` wind-down ends: emit the glide, then park).
- A send-off / wind-down ramp should emit its speed events **`unscaled`** (see
  `SpeedEvent.unscaled` in `program.ts`), so a magnitude ceiling like intensity
  can't shrink the ramp out from under it — Goon's `buildCummingScript` does this.
