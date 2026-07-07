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

`npm run lint` runs with `--max-warnings 0` and **currently fails on two pre-existing issues unrelated to any new work**: a parse error in `public/kws-audio-worklet.js` and a `react-hooks/exhaustive-deps` warning in `src/app/page.tsx`. So repo-wide lint is red by default. Gate on typecheck being clean and your *changed* files being lint-clean (`npx eslint <files>` → no output) — i.e. introduce no new problems — not on repo-wide lint passing.

## Architecture

Read [ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md) for the full picture, and the per-algorithm docs ([GOONING-AUTOPILOT.md](./GOONING-AUTOPILOT.md), [HOMEGROWN-AUTOPILOT.md](./HOMEGROWN-AUTOPILOT.md), [VACUGLIDE-AUTOPILOT.md](./VACUGLIDE-AUTOPILOT.md)) before changing an algorithm. The cross-file things worth knowing up front:

- **Three layers per algorithm**: a plain-TS **engine** (`src/lib/*-autopilot-engine.ts`, owns device commands + a subscribe/notify loop, no React), a **hook** (`src/hooks/use-*-autopilot.ts`, mirrors the engine into render state and owns the UI defaults it constructs the engine with), and a **panel** (`src/components/*-autopilot-panel.tsx`, presentation only). The engine knows nothing about the UI.
- **Shared device + runner**: every algorithm reaches the device through `useVacuglideDevice` via a `getDevice()` accessor (not its own connection), and `useAlgorithmRunner` coordinates them — it derives the running algorithm from the engines' own `isPlaying`, enforces mutual exclusion, and routes detected keywords to the running algorithm. **Adding an algorithm** = new engine/hook/panel, then one entry in the `algorithms[]` array in `src/app/page.tsx` and one tab; nothing else wires up.
- **Engines are intentionally self-contained**: they do not import from each other. Gooning deliberately duplicates Homegrown's `buildLeg` / `scaleSpeed` / cumming helpers rather than sharing a module — this is a chosen boundary, so don't refactor engines into a shared module without asking.
- **Keyword spotting drives the device**: `useKeywordSpotter` (vosk-browser) and all algorithm hooks are mounted at the top of `src/app/page.tsx` so they keep running across tab switches; the recognizer grammar is exactly the running algorithm's published keywords plus global `connect`/`start`/`stop`, dispatched through the runner.
