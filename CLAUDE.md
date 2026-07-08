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

## Architecture

Read [ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md) for the full picture, and the per-algorithm docs ([ALGORITHM-GOON.md](./ALGORITHM-GOON.md), [ALGORITHM-GROOVE.md](./ALGORITHM-GROOVE.md), [ALGORITHM-AUTOPILOT.md](./ALGORITHM-AUTOPILOT.md)) before changing an algorithm. Throughout, a **program** means the timed plan of what the device will do over a run — the speeds and stroke changes laid out on a timeline. The cross-file things worth knowing up front:

- **Engine → Player → hook → panel per algorithm**: the **engine** (`src/lib/*-engine.ts`, no React, no device) only *generates a program* — a schedule of timed speed/valve events over program-time — and rescales each event's magnitude at send time. The one shared **Player** (`src/lib/player.ts`, owned by `useVacuglideDevice`) actually *plays* a program: it owns the clock, the tick loop, device sends, and transport (play/pause/seek/playback-rate, and dropping + regenerating the not-yet-played tail). A **hook** (`src/hooks/use-*.ts`) points the Player at its engine, drives transport, mirrors the Player's state into render state, and owns the UI defaults. A **panel** (`src/components/*-panel.tsx`) is presentation only. The engine knows nothing about the UI or the device.
- **Shared device + runner**: the Player is the single path to the device (no algorithm holds its own connection), and the runner (`src/hooks/use-algorithm-runner.ts`) coordinates the algorithms — it derives the running one from each hook's play state, enforces mutual exclusion (starting one stops the others), and routes detected keywords to it. **Adding an algorithm** = new engine/hook/panel, then register it in `src/app/page.tsx` (one array entry + one tab); nothing else wires up.
- **Engines are intentionally self-contained**: they do not import from each other. Goon deliberately duplicates Groove's generation helpers rather than sharing a module — a chosen boundary, so don't refactor engines into a shared module without asking. The boundary is only about *generation* code; shared infrastructure like the Player is fine.
- **Keyword spotting drives the device**: the keyword spotter (vosk-browser) and all algorithm hooks are mounted at the top of `src/app/page.tsx` so they keep running across tab switches; the recognizer grammar is exactly the running algorithm's published keywords plus the global `connect`/`start`/`stop` voice commands, dispatched through the runner.
