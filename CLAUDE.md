# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Next dev server on http://localhost:8931 (bound to `0.0.0.0`).
- `npm run build` — production build; also runs `tsc`, so it catches RSC/Next issues the dev server tolerates.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint --max-warnings 0`.
- `npm run format` — Prettier over `src` and root config/docs.

## Verifying changes

There is **no test framework** here (no vitest/jest) — don't look for or write unit tests, and don't add a test runner without being asked. Because this app drives physical hardware, the real gate is `npm run typecheck` + `npm run build` plus driving the app in the browser and watching behaviour.

`npm run lint` runs with `--max-warnings 0`, and the repo is kept at **zero warnings**. This is a zero-warning outfit: always fix every lint and typecheck warning or error before you finish — including ones your direct changes didn't cause. Never leave a warning behind or treat one as "pre-existing, not mine." Gate on both `npm run lint` and `npm run typecheck` being completely clean (no output).

## Changelog

Keep [CHANGELOG.md](./CHANGELOG.md) current. Update it **after each logical set of changes** as part of the work itself — not tied to a commit or PR (a change can span several commits, and commits land after a PR is opened). If you finished something a user would notice, it gets an entry before you consider the work done.

- **Format:** one line per change, newest first, grouped under the date it landed (`## YYYY-MM-DD`). Tag each line `feature`, `enhancement`, or `bug`, and within a day order the entries in exactly that sequence — all features, then all enhancements, then all bugs. Link the PR: `([#N](https://github.com/autogoon/autogoon/pull/N))`.
- **Write for the user, not the developer:** describe what someone using the app notices. A pure refactor with no user-visible effect gets no entry.
- **Only tag a `bug` if it shipped on `main`.** A regression introduced *and* fixed within the same PR is not a changelog bug — leave it out; the net user-facing feature/enhancement line already covers the behaviour.

## Architecture

Read [ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md) for the full picture, and the per-algorithm docs ([ALGORITHM-GOON.md](./ALGORITHM-GOON.md), [ALGORITHM-GROOVE.md](./ALGORITHM-GROOVE.md), [ALGORITHM-AUTOPILOT.md](./ALGORITHM-AUTOPILOT.md)) before changing an algorithm. Throughout, a **program** means the timed plan of what the device will do over a run — the speeds and stroke changes laid out on a timeline. The cross-file things worth knowing up front:

- **Engine → Player → panel per algorithm**: the **engine** (`src/lib/algorithms/*-engine.ts`, no React, no device) only _generates a program_ — a schedule of timed speed/valve events over program-time — and rescales each event's magnitude at send time. Generation is split into two channels: `generateSpeed` (the stateful backbone) and `generateValves` (a _pure_ overlay laid across a span of already-built speed), so the Player can re-lay valves over an unchanged speed script (`invalidateValves()`) for a valve-only knob like Autopilot's vacuum maintenance. The one shared **Player** (`src/lib/player.ts`, owned by `useVacuglideDevice`) actually _plays_ a program: it owns the clock, the tick loop, device sends, and transport (play/pause/seek/playback-rate, and dropping + regenerating the not-yet-played tail). A **panel** (`src/components/algorithms/*-panel.tsx`) owns its engine instance (a `useRef`), arms/plays the Player with it, holds its knob state (setting the engine's fields directly), and declares its commands. `usePlayer` (`src/hooks/use-player.ts`) mirrors the Player into React state **once** (in `page.tsx`) and the view is passed down to the panels. There is no per-algorithm hook.
- **One Player = mutual exclusion; no runner**: the Player is the single path to the device and holds **one engine at a time** — a panel arming its engine replaces whoever was there, so "starting one stops the others" is a Player invariant, not a coordinator. `page.tsx` keeps only the tab lock and the global voice words (`connect` + the per-algorithm switch words); everything else is an algorithm command owned by the active panel. **Adding an algorithm** = new engine + panel, then one `<Panel>` + one tab in `src/app/page.tsx`; nothing else wires up.
- **Commands are declared once**: each action is a `Command` (`{ word, enabled, run }`) — the button and the spoken word share one `run` and one `enabled` (a disabled control is also out of the grammar). `useVoiceCommands` (`src/hooks/use-voice-commands.ts`) registers the active panel's enabled words with the recognizer and routes detections back.
- **Engines are intentionally self-contained**: they do not import from each other. Goon deliberately duplicates Groove's generation helpers rather than sharing a module — a chosen boundary, so don't refactor engines into a shared module without asking. The boundary is only about _generation_ code; shared infrastructure like the Player is fine.
- **Keyword spotting drives the device**: there is **one** vosk recognizer, owned by `KeywordSpotterProvider` (`src/components/keyword-spotter.tsx`) at the top of `src/app/page.tsx` so it keeps running across tab switches. Its grammar is the active panel's enabled words (set via `setAlgorithmKeywords`) plus the page's global words (`setGlobalWords`); components subscribe to detections with `keywordListener`.
