# Developing Autogoon

How to run Autogoon locally and contribute changes. For how the app is put
together internally — the program/player model, the engine/panel split, the
shared device layer and single Player, and the keyword spotter — see
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Running locally

You need **[Node.js](https://nodejs.org/) 20.9 or newer** (npm comes with it)
and **git**. Installing those is beyond this doc's scope — the installers on
nodejs.org, or your platform's package/version manager, all work.

```sh
npm install
npm run dev      # Next dev server on http://localhost:8931 (bound to 0.0.0.0)
```

Everything runs with no configuration except **Companions**, which needs API
keys: copy [`.env.example`](./.env.example) to `.env` and fill it in. On the dev
server Companions then unlocks with no access ID (the gate applies to
builds/deploys only).

Other scripts:

- `npm run build` — production build (also runs `tsc`, so it catches RSC/Next
  issues the dev server tolerates).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint --max-warnings 0`.
- `npm run format` — Prettier over `src`, `tests`, and the repo's config and
  markdown (root, `docs/`, `roadmap/`, `modes/`).
- `npm test` — Jest unit tests.
- `npm run test:e2e` — Playwright end-to-end tests (see [Testing](#testing)).

The ~40MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is
fetched by the page on load and cached by the browser; nothing else is needed
offline.

## Contributing

- **Branch off `main`** — never commit to `main` directly. One branch/PR per
  piece of work.
- **Run the tests** (`npm test` and `npm run test:e2e` — see
  [Testing](#testing)). They're a floor, not the whole story: the app drives
  physical hardware, so behaviour changes still want the app run and the
  affected flow driven in the browser — not just typecheck and build.
- **Open a pull request** — push your branch (`git push -u origin <branch>`) and
  open a PR against `main` with `gh pr create` (the GitHub CLI), or the "Compare
  & pull request" prompt GitHub shows after you push.
- **Update [CHANGELOG.md](./CHANGELOG.md)** for every notable change —
  user-facing ones described by what the app does, internal ones (refactors,
  etc.) by what changed. One entry per change, newest first, grouped by date,
  tagged `feature` / `enhancement` / `bug` / `internal` (in that order within a
  day), linking the PR.
- **Before it's reviewed** — `npm run typecheck`, `lint`, and `format` must all
  pass with **zero warnings** (typecheck and lint produce no output; fix every
  warning, not just the ones your change introduced). Individual commits needn't
  be spotless — the PR as a whole must be clean — and commit anything `format`
  reformats.
- **Adding a play mode?** See [Adding a play mode](#adding-a-play-mode) below
  for the full checklist. **Adding a companion?**
  [Adding a companion](#adding-a-companion).
- **Respect the [content policy](#content-policy)** — no features that host,
  index, or point at content.

## Content policy

Autogoon is a player, not a distributor. Because of the UK Online Safety Act
(and copyright law), the project does not — and will not — distribute adult
content, host or index goonpacks, or recommend where content can be acquired.
Users bring their own files; everything stays on their own machine, and the app
stays dumb about where it came from.

The issue is the content — imagery — not the pack format itself: the repo
carries one deliberately pictureless example pack
([`goonpacks/elise/`](./goonpacks/elise/), the worked example in
[GOONPACKS.md](./GOONPACKS.md)), and that is the only pack it will ever carry.

Contributions must keep it that way. Don't submit features that:

- bundle, host, or download content (the pictureless example pack above is the
  one exception, and it stays pictureless);
- index, list, or link to packs or content sources (no "browse packs", curated
  lists, or in-app galleries of third-party content);
- point users at places to acquire content — in the app or its docs.

Import-your-own-file is the only acquisition path the app knows about.

## Testing

Two layers, both local-only for now (no CI):

- **Unit tests** — `npm test` (Jest via `next/jest`, node environment). They
  live next to what they test (`src/**/*.test.ts`) and cover pure logic: engine
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
plays a committed wav of a synthesized play mode name into it once, then asserts
the app heard it and navigated to that play mode's screen.

Two hard-won details — the stub's always-on silence source, and the pre-pipeline
activation click — are load-bearing and commented in place in
`tests/e2e/voice-tab-switch.spec.ts`; read them before writing more voice tests.

Fixtures are committed under `tests/fixtures/`; regenerate them with
`tests/fixtures/generate.sh` (macOS only — it uses `say`).

The first time the suite runs a given browser, macOS asks whether to allow it to
use the microphone — approve it once per browser and it won't ask again. (The
tests never use the real mic, but the browsers still request the permission.)

## Goonpack sources

`goonpacks/` (gitignored — it's where your own content lives, per the
[content policy](#content-policy) — except the committed example pack `elise/`)
holds one source directory per pack you're assembling, plus the `.zip` files
`goonpack:build` produces from them. The authoring workflow (directory layout,
manifest fields, the two pack kinds) is user-facing and lives in
[GOONPACKS.md](./GOONPACKS.md); the three `goonpack:*` npm scripts that operate
on it (`describe`, `describe-missing`, `build`) are commented at their
definitions in `scripts/`.

## Adding a play mode

A play mode is a self-contained pair — an **engine** (event generation, no
React, no device) and a **panel** (the React surface that owns the engine and
drives the shared Player) — registered in `src/app/page.tsx`. Read the
engine/panel split in [ARCHITECTURE.md](./ARCHITECTURE.md) first.

**Copy an existing play mode as your starting point.** `goon-engine.ts` +
`goon-panel/` exercise the full feature set (an automatic build curve, a setup
view with per-concern option cards, a live-scaled magnitude knob, valve teases,
time dilation, and a bespoke `cumming` wind-down), so Goon is the richest
template. For a simpler _manual-knob_ mode, `groove-engine.ts` +
`groove-panel.tsx` are the leaner model.

### The steps

1. **Engine** — `src/lib/play-modes/<name>-engine.ts`, a plain `PlayModeEngine`
   (no React, no device).
   - Implement the four methods from
     [`src/lib/program.ts`](./src/lib/program.ts): `reset`, `generateSpeed`,
     `generateValves`, `scale`. That interface is the contract and the
     best-commented file to read first.
   - Engines are **self-contained** — they never import from each other. If you
     reuse another play mode's pattern (as Goon reuses Groove's dip),
     **duplicate** the helper, don't share it.
2. **Panel** — `src/components/play-modes/<name>-panel.tsx` (or a
   `<name>-panel/` directory with the panel in `index.tsx`, once it has enough
   pieces — Goon splits its setup option cards out this way). Copy Goon's or
   Groove's structure; what's play-mode-specific is only your knob cards and
   their commands. Whether a play mode has a **setup view** before its play view
   is the panel's own choice — Goon has one, Groove and Autopilot don't. The
   parts to copy:
   - a `useRef` engine — **stable identity matters**: the Player identifies the
     active source by reference, so never re-create it (no `useMemo` with deps);
   - `isCurrent` / `state` derived from the Player view;
   - an effect that arms the preview when the screen becomes active (skip this
     if your panel gates arming behind a setup view, as Goon does);
   - `start` / `stop` / `reset`, and a `Command[]` handed to `useVoiceCommands`;
   - the shared scaffolding: `SessionControls`, `Sparkline`, `StrokeCard`,
     `LogCard`.

   Two things to copy deliberately:
   - **Reset is two layers.** Your `reset` restores the knobs' React state and
     their engine defaults, then re-arms — the Player rebuilds the program from
     the start and calls `engine.reset()` to clear transient state (e.g. a
     pending `cumming`).
   - **Endings belong to the panel, not `StrokeCard`** (which is just the shared
     stroke ± buttons). If your play mode has an ending, render a `FinishButton`
     and/or a `CummingButton` — **Finish** (a _pre_-ending: reach/hold the
     climax point) and **Cumming** (the send-off) are distinct actions. Have
     both, one, or neither.

3. **Register it in `src/app/page.tsx`** — three edits:
   - import the panel;
   - add a `PLAY_MODES` entry — the fields are commented at the registry; the
     `id` doubles as the voice switch word and the screen, so this one entry is
     the whole registration;
   - render `<YourPanel …>` in its `hidden`-toggled `<div>` alongside the
     others, passing `active={screen === "<name>"}`.
4. **User-facing copy:** add `modes/<NAME>.md` (high-level and experiential,
   like the others — not an implementation spec), and link it from
   [MODES.md](./MODES.md) and `README.md`'s mode list.
5. **Changelog** — add a `feature` line to [CHANGELOG.md](./CHANGELOG.md).

### Which knob-change method to call

When a knob changes, how it reaches the device depends on _what_ changed. Pick
by where the change lives (see the `Player` methods in
[`src/lib/player.ts`](./src/lib/player.ts)):

| Knob affects…                         | Method                      | Example                                |
| ------------------------------------- | --------------------------- | -------------------------------------- |
| A **magnitude** applied in `scale()`  | `device.refresh()`          | Goon Intensity, Groove Speed           |
| The **shape** of the speed script     | `device.invalidateFuture()` | Groove Variability; `cumming`/`finish` |
| **Valves only**, over unchanged speed | `device.invalidateValves()` | Autopilot Vacuum Maintenance           |

Why it matters for _feel_: generation has random elements, so regenerating for a
mere magnitude change would jump the rider onto a fresh pattern instead of
smoothly rescaling the one they're already feeling. The mechanics — pattern
space, scale-at-send-time, what each invalidation drops — are commented on the
methods themselves in [`src/lib/player.ts`](./src/lib/player.ts); read those
before picking.

### `generateSpeed` pitfalls

The easy-to-get-wrong parts — each batch must extend **past `fromTime`** (or the
Player's look-ahead spins), returning **`[]` parks** the program, and send-off
ramps emit **`unscaled`** so an intensity ceiling can't shrink them — are all
spelled out in the contract comments in
[`src/lib/program.ts`](./src/lib/program.ts) (`generateSpeed`,
`SpeedEvent.unscaled`). Read that file first; it's the contract.

## Adding a companion

A companion is **pure data** — one `Companion` entry plus a persona module. The
picker, the play session, the saved thread and the voice switch all derive from
the entry, so there is nothing else to wire up. The fields are commented on the
`Companion` type in
[`src/lib/companions/companions.ts`](./src/lib/companions/companions.ts).

1. **Persona module** — `src/lib/companions/<name>-prompt.ts`, exporting her
   system prompt. Copy `aimee-prompt.ts`'s shape: interpolate the shared
   sections from `shared-prompt.ts` (each export is commented with where it
   slots in; `CONTROL_SECTION` must come last — it ends with the `{{NOW}}` and
   `{{TOY_STATUS}}` markers), write her in the **second person**, and keep only
   what is _her_ in the module: character, setup, tone, and disposition —
   crucially, **who leads** during play, which the shared blocks are neutral on.
2. **Register her** — add the `COMPANIONS` entry (id, model, context window,
   voice, prompt). Give her an `autogoon.<name>` id, matching the stock
   companions. Pick an ElevenLabs `voiceId` (not a secret) and a model that
   suits the persona — explicit-content suitability and reliable tool-calling
   are properties of the model, so test hers before settling. She ships
   **pictureless**, like the other built-ins — pictures reach her via an
   [overlay goonpack](./GOONPACKS.md), not the repo.
3. **Test** — the registry test already enforces id = record key for every
   entry; add a config `describe` block for her alongside Aimee's and Miley's
   (`src/lib/companions/companions.test.ts`).
4. **Changelog** — a `feature` line in [CHANGELOG.md](./CHANGELOG.md).
