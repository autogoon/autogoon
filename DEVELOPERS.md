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
- `npm run format` — Prettier over `src` and the root config/docs.

The ~40MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is
fetched by the page on load and cached by the browser; nothing else is needed
offline.

## Contributing

- **Branch off `main`** — never commit to `main` directly. One branch/PR per piece
  of work.
- **Before committing** — at the latest before the PR is ready to review — run
  `npm run typecheck`, `npm run lint`, and `npm run format`. **Zero warnings:**
  typecheck and lint must pass with no output; fix every warning, not just the
  ones your change introduced. If `format` changes files, commit those changes.
- **No test framework.** The app drives physical hardware, so verify changes by
  running the app and driving the affected flow in the browser — not just
  typecheck and build.
- **Update [CHANGELOG.md](./CHANGELOG.md)** for every notable change — user-facing
  ones described by what the app does, internal ones (refactors, etc.) by what
  changed. One line per change, newest first, grouped by date, tagged `feature` /
  `enhancement` / `bug` / `internal` (in that order within a day), linking the PR.
- **Adding an algorithm?** See [Adding an algorithm](#adding-an-algorithm) below
  for the full checklist.

## Adding an algorithm

An algorithm is a self-contained pair — an **engine** (event generation, no React,
no device) and a **panel** (the React surface that owns the engine and drives the
shared Player) — registered in `src/app/page.tsx`. Read the engine/panel split in
[ARCHITECTURE.md](./ARCHITECTURE.md) first. **Copy Goon as your starting point:**
`goon-engine.ts` + `goon-panel.tsx` exercise the full feature set (an automatic
build curve, a live-scaled magnitude knob, valve teases, time dilation, and a
bespoke `cumming` wind-down), so it's the richest template. For a simpler
_manual-knob_ mode, `groove-engine.ts` + `groove-panel.tsx` are the leaner model.

### The steps

1. **Engine** — `src/lib/algorithms/<name>-engine.ts`, implementing
   `AlgorithmEngine` from [`src/lib/program.ts`](./src/lib/program.ts) (the
   interface is the contract, and it's the best-commented file to read): `reset`,
   `generateSpeed`, `generateValves`, `scale`. Engines are **self-contained** —
   they never import from each other; if you reuse another algorithm's shape (as
   Goon reuses Groove's dip), duplicate the helper, don't share it.
2. **Panel** — `src/components/algorithms/<name>-panel.tsx`. Copy Goon's/Groove's
   structure: a `useRef` engine (stable identity — the Player identifies the
   active source by reference, so never re-create it), `isCurrent`/`state` derived
   from the Player view, an effect that arms the preview when the tab becomes
   active, `start`/`stop`/`reset`, a `Command[]` handed to `useVoiceCommands`, and
   the shared `ListeningFor` / `RunButton` / `Sparkline` / `StrokeCard` / `LogCard`
   scaffolding. What's algorithm-specific is your knob cards and their commands.
3. **Register it in `src/app/page.tsx`** — three edits:
   - import the panel;
   - add a `TABS` entry with **`algorithm: true`** (this one flag is what puts the
     id into `ALGORITHM_TABS`, so the voice switch word and the tab lock both work
     — miss it and the tab renders but neither does, with no type error to warn
     you);
   - render `<YourPanel …>` in its `hidden`-toggled `<div>` alongside the others,
     passing `active={tab === "<name>" || runningTab === "<name>"}`.
4. **User-facing copy** — add `ALGORITHM-<NAME>.md` (high-level and experiential,
   like the others — not an implementation spec) and link it from `README.md` (the
   mode list and the Documentation list); and update the in-app intro in
   `src/components/settings-panel.tsx`, which hardcodes both the mode list and the
   spoken switch words.
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
it plays. This is a deliberate optimisation, and it matters for _feel_:
regenerating instead (`invalidateFuture()`) would build a **different** program,
because generation has random elements (timing jitter, dip variation) — so a
magnitude change would jump you onto a fresh pattern rather than smoothly rescaling
the one you're already feeling. Scaling keeps the exact same shape, just louder or
quieter.

Reach for `invalidateFuture()` only when the **shape** genuinely changed: it drops
and rebuilds the not-yet-played tail from the new engine state (accepting that the
random tail is now a different draw). `invalidateValves()` re-lays only the valve
overlay, leaving the speed backbone — and its randomness — intact.

### `generateSpeed` pitfalls

The contract (`program.ts`) spells these out, but they're the easy ones to get
wrong:

- Each call must return events extending **past `fromTime`** (in whole cycles). A
  batch whose last event lands at or before `fromTime` makes no progress, and the
  Player's look-ahead loop spins building empty cycles.
- Return **`[]` to park** — nothing more to play until a knob changes (this is how
  Goon's `cumming` wind-down ends: emit the glide, then park).
