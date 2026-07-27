# Developing Autogoon

How to run Autogoon locally and contribute changes. For how the app is put
together internally — the program/player model, the engine/panel split, the
shared device layer and single Player, and the keyword spotter — see
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Adding a companion

Not a code change: a companion is a [goonpack](./GOONPACKS.md), which is the
form anyone else can install, and [GOONPACKS.md](./GOONPACKS.md) is the guide.

The companions built into the app are a deliberately small set, there to give it
a range rather than to collect them, so a pull request adding one is unlikely to
be accepted unless it fills a genuine gap in ethnicity or gender. If you think
it does, build it as a goonpack and submit that for consideration — writing the
persona and picking the voice is the same work either way.

## Running locally

Requirements:

- [Node.js](https://nodejs.org/) 20.9 or newer — npm comes with it
- `git`

Installing these is beyond this doc's scope — the installers on nodejs.org, or
your platform's package/version manager, all work.

```sh
npm install
npm run dev      # Next dev server on http://localhost:8931 (bound to 0.0.0.0)
```

Everything runs with no configuration except **Companions**, which needs API
keys: copy [`.env.example`](./.env.example) to `.env` and fill it in. On the dev
server Companions then unlocks with no access ID (the gate applies to
builds/deploys only).

The dev server binds `0.0.0.0`, so a phone on your network can load it — but
Next blocks its own cross-origin dev assets by default, which looks like a
broken app (the page renders, nothing is clickable). Set `DEV_ALLOWED_ORIGINS`
in `.env` (documented in [`.env.example`](./.env.example)) and restart the dev
server to fix it.

`npm run build` makes a production build — it also runs `tsc`, so it catches
RSC/Next issues the dev server tolerates.

The ~40MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is
fetched by the page on load and cached by the browser; nothing else is needed
offline.

## Making changes

Requirements, on top of those for [running locally](#running-locally):

- `jq` and `claude` — for [the shell-edit guard](#the-shell-edit-guard)

The scripts:

- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint --max-warnings 0`.
- `npm run format` — Reformats code and markdown documentation; the globs
  defining what it covers are in `package.json`.
- `npm test` — Jest unit tests.
- `npm run test:e2e` — Playwright end-to-end tests (see [Testing](#testing)).

Then:

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
- **Document it for whoever it's for** — a user-facing feature needs its
  user-facing page (`modes/*.md` for a play mode) and a link from
  [MODES.md](./MODES.md) and `README.md`; something only a developer sees is
  explained where it lives, or in [ARCHITECTURE.md](./ARCHITECTURE.md) if it
  spans files.
- **Respect the [content policy](#content-policy)** — no features that host,
  index, or point at content.

## The shell-edit guard

Edits go through tools that render a reviewable diff, never a shell rewrite —
the rule, and why, are in [CLAUDE.md](./CLAUDE.md) under Editing files. A
PreToolUse hook backs it up:
[`.claude/hooks/no-shell-edits.sh`](./.claude/hooks/no-shell-edits.sh),
registered in `.claude/settings.json`.

Its patterns — an interpreter by name, an in-place `sed` or `perl` — only decide
what is worth asking about; whether the command actually writes to a file is a
question about the script it carries, so every match is put to Claude and
nothing is denied on the shape of the text alone. A missing dependency, a slow
answer, or anything but a clear verdict lets the command run — a blocked commit
costs more than the unreviewable edit this catches.

## Content policy

Autogoon is a player, not a distributor. Because of the UK Online Safety Act
(and copyright law), the project does not — and will not — distribute adult
content, host or index goonpacks, or recommend where content can be acquired.
Users bring their own files; everything stays on their own machine, and the app
stays dumb about where it came from.

The issue is the content — imagery, still or moving — not the pack format
itself: the repo carries one deliberately media-free example pack
([`goonpacks/elise/`](./goonpacks/elise/), the worked example in
[GOONPACKS.md](./GOONPACKS.md)), and that is the only pack it will ever carry.

Contributions must keep it that way. Don't submit features that:

- bundle, host, or download content (the media-free example pack above is the
  one exception, and it stays media-free);
- index, list, or link to packs or content sources (no "browse packs", curated
  lists, or in-app galleries of third-party content);
- point users at places to acquire content — in the app or its docs.

Import-your-own-file is the only acquisition path the app knows about.

## Testing

Two layers, both local-only for now (no CI):

- **Unit tests** — `npm test` (Jest via `next/jest`). They live next to what
  they test and cover pure logic: engine generation contracts, the device
  client's rate-limit accounting. Import from `@jest/globals` rather than
  relying on globals. The environment is node by default, which is why the suite
  runs in a second or so; a test that renders a hook or a component asks for
  jsdom in a `@jest-environment jsdom` docblock at the top of the file
  (`src/hooks/use-media-url.test.ts` is the shortest example). Keep that opt-in
  per file — a global jsdom would slow every engine test down for nothing.
- **End-to-end tests** — `npm run test:e2e` (Playwright, in `tests/e2e/`). Every
  spec runs on real Chromium, Firefox **and** WebKit; the config starts the dev
  server on :8931 (or reuses one already running). The goonpack specs are the
  one exception, and skip themselves rather than being pinned to a browser: they
  probe OPFS and stand down where it is unusable (`tests/e2e/opfs.ts` explains
  which engine that is today, and why the check is a capability probe).

A green E2E run therefore says nothing about pack storage on the engine that
skipped — there is no OPFS there to run against. That is a standing limitation,
not a gap to fix or re-report: the unit tests hold the shape, and a change
touching OPFS needs a pass by hand in real Safari, which does support it. The
skips disappear on their own if the test browser ever gains OPFS.

The voice test is the reason the E2E layer exists: it proves the whole voice
pipeline — AudioWorklet capture, vosk's WASM recognizer, grammar and command
routing — works in each engine. Only the microphone _hardware_ is faked:
`getUserMedia` is stubbed (via `MediaDevices.prototype` — instance assignment
doesn't stick in WebKit) to return a WebAudio-built `MediaStream`, and the test
plays a committed wav of a synthesized play mode name into it once, then asserts
the app heard it and navigated to that play mode's screen.

Two hard-won details — the stub's always-on silence source, and the pre-pipeline
activation click — are required for the test to pass at all, and are commented
in place in `tests/e2e/voice-tab-switch.spec.ts`; read them before writing more
voice tests.

Fixtures are committed under `tests/fixtures/`; regenerate them with
`tests/fixtures/generate.sh` (macOS only — it uses `say`).

The first time the suite runs a given browser, macOS asks whether to allow it to
use the microphone — approve it once per browser and it won't ask again. (The
tests never use the real mic, but the browsers still request the permission.)

## Goonpack sources

`goonpacks/` (gitignored — it's where your own content lives, per the
[content policy](#content-policy) — except the committed example pack `elise/`)
holds one source directory per pack you're assembling — with that pack's
pictures and videos in `goonpacks/<dir>/media/` — plus the `.zip` files
`goonpack:build` produces from them. The authoring workflow (directory layout,
manifest fields, the two pack kinds) is user-facing and lives in
[GOONPACKS.md](./GOONPACKS.md); the three `goonpack:*` npm scripts that operate
on it (`describe`, `describe-missing`, `build`) are commented at their
definitions in `scripts/`. The two captioning scripts are vision-model work and
so cover stills only — a video's caption is written by hand.
