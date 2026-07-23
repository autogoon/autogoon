# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Commands

- `npm run dev` — Next dev server on http://localhost:8931 (bound to `0.0.0.0`).
- `npm run build` — production build; also runs `tsc`, so it catches RSC/Next
  issues the dev server tolerates.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint --max-warnings 0`.
- `npm run format` — Prettier over `src` and root config/docs.

## Secrets / environment

Real keys live in **`.env`** (gitignored via `.env` / `.env.*`), **not**
`.env.local`. Copy [`.env.example`](./.env.example) to `.env` and fill in real
values; never commit a real key (the repo is public). All secret-bearing vars
(`ELEVENLABS_API_KEY`, `OPENROUTER_API_KEY`, `LLM_URL`) are read server-side
only — none are `NEXT_PUBLIC_*`.

## Verifying changes

- `npm test` — Jest unit tests (`src/**/*.test.ts`, colocated, node environment,
  import from `@jest/globals`). Cover pure logic: engine contracts,
  device-client accounting.
- `npm run test:e2e` — Playwright (`tests/e2e/`), running each spec on real
  Chromium, Firefox and WebKit; starts (or reuses) the dev server on :8931. The
  voice test fakes only the microphone (a `MediaDevices.prototype.getUserMedia`
  stub playing a committed wav fixture) — everything downstream (worklet, vosk,
  command routing) is real. Read the Testing section in
  [DEVELOPERS.md](./DEVELOPERS.md#testing) before writing more voice tests: the
  stub's always-on silence source and the pre-pipeline activation click are both
  load-bearing.

Tests are a floor, not the whole gate: the app drives physical hardware, so
behaviour changes still want `npm run typecheck` + `npm run build` plus driving
the app in the browser and watching behaviour.

`npm run lint` runs with `--max-warnings 0`, and the repo is kept at **zero
warnings**. This is a zero-warning outfit: always fix every lint and typecheck
warning or error before you finish — including ones your direct changes didn't
cause. Never leave a warning behind or treat one as "pre-existing, not mine."
Gate on both `npm run lint` and `npm run typecheck` being completely clean (no
output).

Before committing — or at the latest before a finished PR is reviewed — run
`npm run typecheck`, `npm run lint`, and `npm run format`. If `format` changes
files, commit those changes as part of the work; don't leave them or revert
them.

## Changelog

Keep [CHANGELOG.md](./CHANGELOG.md) current. Update it **after each logical set
of changes** as part of the work itself — not tied to a commit or PR (a change
can span several commits, and commits land after a PR is opened). If you
finished something a user would notice, it gets an entry before you consider the
work done.

- **Format:** one line per change, newest first, grouped under the date it
  landed (`## YYYY-MM-DD`). Tag each line `feature`, `enhancement`, `bug`, or
  `internal`, and within a day order the entries in exactly that sequence —
  features, then enhancements, then bugs, then internal (bottom priority). Open
  each entry with a bold, few-word, commit-style summary:
  `- tag: **Add safe word** — description…`. Link the PR:
  `([#N](https://github.com/autogoon/autogoon/pull/N))`. Inline markup is
  limited to `` `code` `` and `[links](url)` — the in-app Changelog screen
  parses exactly this format (src/lib/changelog.ts).
- **Every notable change gets an entry, described for whoever cares about it.**
  A user-facing change gets a user-friendly description — _what the app does,
  not how it's built_. A developer-facing change (an internal refactor and the
  like) gets a developer-friendly description of _what changed_, tagged
  `internal`. Don't force a user angle onto a pure refactor, and don't drop a
  change just because users won't notice it.
- **Only tag a `bug` if it shipped on `main`.** A regression introduced _and_
  fixed within the same PR is not a changelog bug — leave it out; the net
  user-facing feature/enhancement line already covers the behaviour.

## Documentation

Docs point at code; they don't duplicate it. **Code owns the what** — type
fields, signatures, tool lists, knob ranges, model slugs, defaults — explained
by comments at the definition site. **Docs own what code can't say** — intent,
invariants, the why, and the cross-file shape. Concretely:

- Never copy a type, command list, or config value into a doc. Link the source
  file and say what it's for ("the fields are commented there").
- If a sentence goes stale when someone renames a field or adds an entry, it's
  implementation detail — replace it with a pointer.
- Docs that are deliberately exhaustive are the exception, and say so
  ([modes/AUTOPILOT.md](./modes/AUTOPILOT.md) is the only record of the
  reverse-engineered algorithm).
- When code you change is mentioned in a doc, updating the doc is part of the
  change. Run `/doc-check` before a PR is marked ready to catch what slipped.

## Git workflow

- Work on a branch off `main`; never commit to `main` directly. One branch/PR
  per piece of work.
- The flow is **branch → do the work → gates → commit → push → open a PR →
  merge**: push with `git push -u origin <branch>`, then open a PR against
  `main` with `gh pr create`.
- **Before a PR is marked ready for review**, the whole gate set passes:
  `npm run typecheck`, `lint` and `format` clean (see Verifying changes), tests
  run, the CHANGELOG entry written, `/doc-check` run over the branch's diff, and
  `/personal-check` if the branch touched docs or content.
- Merge PRs with a **merge commit** (not squash or rebase) and **delete the
  branch, local and remote** — `gh pr merge <n> --merge --delete-branch`.
- Committing, pushing and merging are separate actions: only do each when asked.

## Architecture

Read [ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md) for the
full picture, and the per-play-mode docs ([modes/GOON.md](./modes/GOON.md),
[modes/GROOVE.md](./modes/GROOVE.md),
[modes/AUTOPILOT.md](./modes/AUTOPILOT.md),
[modes/COMPANIONS.md](./modes/COMPANIONS.md)) before changing a play mode.
Throughout, a **program** means the timed plan of what the device will do over a
run — the speeds and stroke changes laid out on a timeline. The cross-file
things worth knowing up front:

- **Engine → Player → panel per play mode**: the **engine**
  (`src/lib/play-modes/*-engine.ts`, no React, no device) only _generates a
  program_ — a schedule of timed speed/valve events over program-time — and
  rescales each event's magnitude at send time. Generation is split into two
  channels: `generateSpeed` (the stateful backbone) and `generateValves` (a
  _pure_ overlay laid across a span of already-built speed), so the Player can
  re-lay valves over an unchanged speed script (`invalidateValves()`) for a
  valve-only knob like Autopilot's vacuum maintenance. The one shared **Player**
  (`src/lib/player.ts`, owned by `useVacuglideDevice`) actually _plays_ a
  program: it owns the clock, the tick loop, device sends, and transport
  (play/pause/seek/playback-rate, and dropping + regenerating the not-yet-played
  tail). A **panel** (`src/components/play-modes/*-panel.tsx`, or a `*-panel/`
  directory with the panel in `index.tsx` when it splits out per-concern cards,
  as Goon does) owns its engine instance (a `useRef`), arms/plays the Player
  with it, holds its knob state (setting the engine's fields directly), and
  declares its commands. `usePlayer` (`src/hooks/use-player.ts`) mirrors the
  Player into React state **once** (in `page.tsx`) and the view is passed down
  to the panels. There is no per-play-mode Player hook (Companions' voice
  session has its own orchestrator hook, but the Player path is the same).
- **One Player = mutual exclusion; no runner**: the Player is the single path to
  the device and holds **one engine at a time** — a panel arming its engine
  replaces whoever was there, so "starting one stops the others" is a Player
  invariant, not a coordinator. Navigation, the global voice words and the
  play-mode registry all live in `src/app/page.tsx`; **adding a play mode** is a
  new engine + panel + one `PLAY_MODES` entry — full checklist in
  [DEVELOPERS.md](./DEVELOPERS.md#adding-a-play-mode).
- **Commands are declared once**: each action is a `Command`
  (`{ word, enabled, run }`) — the button and the spoken word share one `run`
  and one `enabled` (a disabled control is also out of the grammar).
  `useVoiceCommands` (`src/hooks/use-voice-commands.ts`) registers the active
  panel's enabled words with the recognizer and routes detections back.
- **Voice-first**: the app is operated hands-free, so nearly every interactive
  control should also be a voice command — when adding a control, give it a word
  (and the on-screen badge that comes with it) by default. The exceptions are
  free-text input (the safe word field) and continuous input better served by
  discrete step words (a slider gets `more`/`less`-style steps, not a spoken
  value).
- **Engines are intentionally self-contained**: they do not import from each
  other. Goon deliberately duplicates Groove's generation helpers rather than
  sharing a module — a chosen boundary, so don't refactor engines into a shared
  module without asking. The boundary is only about _generation_ code; shared
  infrastructure like the Player is fine.
- **Keyword spotting drives the device**: there is **one** vosk recognizer,
  owned by `KeywordSpotterProvider` (`src/components/keyword-spotter.tsx`) at
  the top of `src/app/page.tsx` so it keeps running across screen changes. Its
  grammar is the active panel's enabled words (set via `setPlayModeKeywords`)
  plus the page's global words (`setGlobalWords`); components subscribe to
  detections with `keywordListener`.
