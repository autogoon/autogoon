# Developing Autogoon

How to run Autogoon locally and contribute changes. For how the app is put
together internally, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Adding a companion

Not a code change. A companion is a [goonpack](./GOONPACKS.md), the form anyone
else can install, and [GOONPACKS.md](./GOONPACKS.md) is the guide to writing
one.

The companions built into the app are a small set, there to give it a range. A
pull request adding one is unlikely to be accepted unless it fills a gap in
ethnicity or gender. If you think it does, build it as a goonpack and submit
that for consideration. Writing the persona and picking the voice is the same
work either way.

## Running locally

Requirements:

- [Node.js](https://nodejs.org/) 20.9 or newer — npm comes with it
- `git`

The installers on nodejs.org, or your platform's package/version manager, all
work.

```sh
npm install
npm run dev      # Next dev server on http://localhost:8931 (bound to 0.0.0.0)
```

Everything runs with no configuration except **Companions** and the dev-only
**Inference** tab, both of which need API keys. Copy
[`.env.example`](./.env.example) to `.env` and fill it in. On the dev server
Companions then unlocks with no access ID; the gate applies to builds/deploys
only.

The dev server binds `0.0.0.0`, so a phone on your network can load it. Next
blocks its own cross-origin dev assets by default. That looks like a broken app:
the page renders, nothing is clickable. Set `DEV_ALLOWED_ORIGINS` in `.env`
(documented in [`.env.example`](./.env.example)) and restart the dev server to
fix it.

`npm run build` makes a production build. It also runs `tsc`, catching RSC/Next
issues the dev server tolerates.

The ~40MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is
fetched by the page on load and cached by the browser. Nothing else is needed
offline.

## Making changes

The scripts:

- `npm run typecheck` and `npm run lint` — the gates; both must produce no
  output.
- `npm run format` — reformats code and markdown documentation; the globs
  defining what it covers are in `package.json`.
- `npm test` and `npm run test:e2e` — see [Testing](#testing).

Then:

- **Run the tests.** The app drives physical hardware. After a behaviour change,
  run the app and drive the affected flow in the browser as well as typecheck
  and build.
- **Open a pull request** against `main` — from a branch on your fork, with
  `gh pr create` (the GitHub CLI) or the "Compare & pull request" prompt GitHub
  shows after you push.
- **Update [CHANGELOG.md](./CHANGELOG.md)** for every notable change. The entry
  format, and what to write for a user-facing change versus an internal one, are
  in [CLAUDE.md](./CLAUDE.md) under Changelog.
- **Before it's reviewed** — the gates must be clean, and commit anything
  `npm run format` reformats.
- **Document it for whoever it's for.** A user-facing feature needs its
  user-facing page (`modes/*.md` for a play mode) and a link from
  [MODES.md](./MODES.md) and `README.md`. Something only a developer sees is
  explained where it lives, or in [ARCHITECTURE.md](./ARCHITECTURE.md) if it
  spans files.
- **Respect the [content policy](#content-policy)** — no features that host,
  index, or point at content.

## Content policy

Autogoon is a player, not a distributor. Because of the UK Online Safety Act
(and copyright law), the project does not — and will not — distribute adult
content, host or index goonpacks, or recommend where content can be acquired.
Users bring their own files. Everything stays on their own machine, and nothing
in the app records where it came from.

The issue is the content — imagery, still or moving — not the pack format
itself. The repo carries one deliberately media-free example pack
([`goonpacks/elise/`](./goonpacks/elise/), the worked example in
[GOONPACKS.md](./GOONPACKS.md)), and that is the only pack it will ever carry.

Don't submit features that:

- bundle, host, or download content (`goonpacks/elise/` is the one exception,
  and it stays media-free);
- index, list, or link to packs or content sources (no "browse packs", curated
  lists, or in-app galleries of third-party content);
- point users at places to acquire content — in the app or its docs.

Importing your own file is the only acquisition path the app implements.

## Testing

Two layers, both local-only (no CI):

- **Unit tests** — `npm test` (Jest via `next/jest`). They live next to what
  they test. `jest.config.mjs` holds the match set. Import from `@jest/globals`.
  The environment is node by default. A test that renders a hook or a component
  asks for jsdom in a `@jest-environment jsdom` docblock at the top of the file
  (`src/hooks/use-media-url.test.ts` is an example). Keep that opt-in per file;
  a global jsdom would slow every engine test down for nothing.
- **End-to-end tests** — `npm run test:e2e` (Playwright, in `tests/e2e/`). Every
  spec runs on real Chromium, Firefox **and** WebKit. The config starts the dev
  server on :8931, or reuses one already running. The goonpack specs that reach
  OPFS are the one exception. They probe OPFS and skip where it is unusable (the
  comments in `tests/e2e/opfs.ts` name the engine that is unusable today, and
  why the check is a capability probe).

A green E2E run is therefore no evidence about pack storage on the engine that
skipped. That is a standing limitation, not a gap to fix or re-report. The unit
tests cover the logic, and a change touching OPFS needs a pass by hand in real
Safari, which does support it.

The voice test is the reason the E2E layer exists. It proves the whole voice
pipeline works in each engine:

- AudioWorklet capture;
- vosk's WASM recognizer;
- grammar and command routing.

Only the microphone _hardware_ is faked. `getUserMedia` is stubbed (via
`MediaDevices.prototype` — assigning to the instance has no effect in WebKit) to
return a WebAudio-built `MediaStream`. The test plays a committed wav of a
synthesized play mode name into it once, then asserts that the recognizer
detected the keyword and the app navigated to that play mode's screen.

The test passes only with each of these in place, all commented at their sites
in `tests/e2e/voice-tab-switch.spec.ts`. Read them before writing more voice
tests.

- The stub's always-on silence source.
- The pre-pipeline activation click.
- The listen-on-load preference, seeded before the page loads: without it the
  recognizer doesn't start until Listen is pressed, and the setting is read
  during startup, so it can't be turned on through Settings once the app is up.

Fixtures are committed under `tests/fixtures/`; regenerate them with
`tests/fixtures/generate.sh` (macOS only — it uses `say`).

The first time the suite runs a given browser, macOS asks whether to allow it to
use the microphone. Approve it once per browser and it won't ask again. (The
tests never use the real mic, but the browsers still request the permission.)

## Documentation sweep

`npm run docs:sweep` reviews every tracked `.md` file (persona prompts,
CHECK-QUESTIONS.md and the sweep's own briefs excluded) in four passes — doc
(truth), style, register, duplication — each a fresh `claude -p` call returning
findings against a JSON schema. Findings are applied by exact string
substitution and verified by a second fresh call; accepted fixes stay
uncommitted in the working tree for review — the sweep never commits. Anything
needing a human decision lands in `.sweep/questions.md`, with every raw report
under `.sweep/reports/`. The pass prompts are in `scripts/md-sweep-briefs/`; the
rules they enforce live in [CLAUDE.md](./CLAUDE.md) → Documentation and →
Writing style.

Flags: `--files <paths…>` to sweep a subset, `--passes doc,style` to run fewer
passes, `--dry-run` to collect reports without editing, `--model <m>` to pin the
model, `--out <dir>` to move the output dir. The sweep skips any file with
uncommitted changes and never runs `git add` or `git commit`, so it is safe
beside other work in the same checkout; review its output with `git diff`.

## Goonpack sources

`goonpacks/` holds one source directory per pack you're assembling, with that
pack's pictures and videos in `goonpacks/<dir>/media/`, plus the `.zip` files
`goonpack:build` produces from them. The directory is gitignored, since it is
where your own content lives, per the [content policy](#content-policy). The
committed example pack `elise/` is the exception.

A pack's `media/` is also a corpus for the dev-only Inference tab, which writes
its ground truth, answers and archived runs beside the media there.
[INFERENCE.md](./INFERENCE.md) covers the tab and the `experiment:*` scripts.

The authoring workflow (directory layout, manifest fields, the two pack kinds)
is user-facing and lives in [GOONPACKS.md](./GOONPACKS.md). The `goonpack:*` npm
scripts that operate on it are commented at their definitions in `scripts/`.
Being vision-model work, `goonpack:describe` and `goonpack:describe-missing`
cover stills only. A video's caption is written by hand.
