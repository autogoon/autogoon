# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Commands

- `npm run dev` — Next dev server on http://localhost:8931 (bound to `0.0.0.0`).
- `npm run build` — production build; also runs `tsc`, so it catches RSC/Next
  issues the dev server tolerates.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint --max-warnings 0`.
- `npm run format` — Reformats code and markdown documentation; the globs
  defining what are in `package.json`.

## Editing files

Change files with **Edit and Write, never a shell rewrite** — no heredoc script,
`sed -i`, `perl -pi`, redirect into a tracked path, or `git checkout --` over
uncommitted work. Those render no diff, so the change can't be reviewed and has
to be taken on trust from a summary; batching several of them into one script is
what makes a bad edit hard to catch. Several small Edit calls beat one clever
script. A PreToolUse hook backs this up
([.claude/hooks/no-shell-edits.sh](./.claude/hooks/no-shell-edits.sh)) — it
screens the shapes a regex can spot and denies the ones that turn out to be
edits, so it is a backstop for the rule rather than the whole of it. Shell that
only reads — greps, tests, mutation runs against a scratchpad copy — is
unaffected.

## Secrets / environment

### Keys

Real keys live in **`.env`** (gitignored via `.env` / `.env.*`), **not**
`.env.local`. Copy [`.env.example`](./.env.example) to `.env` and fill in real
values; never commit a real key (the repo is public). All secret-bearing vars
(`ELEVENLABS_API_KEY`, `OPENROUTER_API_KEY`, `LLM_URL`) are read server-side
only — none are `NEXT_PUBLIC_*`.

### What must never be committed

This repo is **public and pseudonymous**. Never commit identifying details: real
names, `/Users/<name>` or other machine-local paths, personal emails or URLs,
session links. When a doc or plan needs a concrete path, genericize it
(`~/.claude/jobs/<job-id>/tmp`, not the real one). Also never: a platform name
in a downloading or collecting context (the app is source-agnostic), anything
describing the local media set under `goonpacks/<dir>/media/` (gitignored and
personal — write about the feature, never its contents), and analysis of the
author's own legal exposure. `/personal-check` is the backstop, not the defence
— history rewrites are the only fix once pushed.

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
  required, and the test fails in ways that don't name them if either goes.

Tests are a floor, not the whole gate: the app drives physical hardware, so
behaviour changes still want `npm run typecheck` + `npm run build` plus driving
the app in the browser and watching behaviour.

### What a test is for

- **A test fails only when something is broken** — never because a design choice
  changed. Test that a unit does its job, not the values it happens to use:
  engine curves, dip floors and thresholds measured off today's output are tuned
  by hand and are not contracts. Assert a value only where it is not ours to
  change — wire and file formats, user-facing strings, and
  `autopilot-engine.ts`'s constants, which recreate Autoblow's Autopilot.
- **A test that cannot fail is removed**, not patched to keep its name. Delete
  it outright where it is a tautology, a duplicate, or a restatement of its own
  fixture. Where the contract matters, delete it and write a real one named for
  what that one pins — the result is a new test that bites, not an old one with
  a patched fixture. Never leave a contract that matters with no coverage.
- **A fake stands at a boundary** so a test can assert what the code sent across
  it, or so a module needing storage or a clock can run at all. Never fake the
  LLM, TTS or STT — the app always has them, so exercise them in `tests/e2e/`. A
  fake may supply the input; the assertion must be on something the code under
  test decided.
- **Anything with a job has a test.** Doing I/O decides how a module is tested,
  never whether.
- **A test name stands alone.** `describe` is the exported symbol under test;
  `it` is a third-person sentence carrying its condition, so the two concatenate
  into one readable sentence in a failure list a year from now. Use real
  identifiers, never the shape of the assertion. No name defined by exclusion
  ("otherwise", "the rest"), none that only parses beside its neighbour. An
  "and" joining two unrelated behaviours means two tests; a compound describing
  one behaviour may keep it.
- **A test comment earns its place** in four situations only: a file header
  saying what the file decides and what it delegates, a fixture whose odd shape
  needs justifying, a regression test naming the defect, and a cast inside a
  fake. Anything restating the test name goes.
- **An LLM's wording is not a contract; its shape is.** Assert the tool call
  parsed, the tool ran, the projected wire messages carry only what the model
  should see. For anything about content, assert only invariants that hold for
  any sane reply, and record the flake rate you measured.

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

- **Format:** one bullet per change — wrapped over indented lines and separated
  by blank lines for readability — newest first, grouped under the date it
  landed (`## YYYY-MM-DD`). Tag each entry `feature`, `enhancement`, `bug`, or
  `internal`, and within a day order the entries in exactly that sequence —
  features, then enhancements, then bugs, then internal (bottom priority). Open
  each entry with a bold, few-word, commit-style summary, then the description
  as a sentence (capital first word, unless it opens with `code`):
  `- tag: **Add safe word** — Description…`. Link the PR:
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
- **No counts that the next commit invalidates** — test totals, suite counts,
  file counts, line counts. Any commit moves them, nothing checks them, and a
  number that has silently gone wrong is worse than no number. This applies to
  PR descriptions too. Say what changed and why it matters; "the tests that
  couldn't fail are gone" survives, "262 tests became 413" is wrong by the
  afternoon.

## Documentation

Docs point at code; they don't duplicate it. **Code owns the what** — type
fields, signatures, tool lists, knob ranges, model slugs, defaults — explained
by comments at the definition site. **Docs own what code can't say** — intent,
invariants, the why, and the cross-file shape. Concretely:

- Never copy a type, command list, or config value into a doc. Link the source
  file and say what it's for ("the fields are commented there").
- If a sentence goes stale when someone renames a field or adds an entry, it's
  implementation detail — replace it with a pointer.
- Current-state docs describe **only what's implemented**. Future work lives in
  [TODO.md](./TODO.md) (defined work), [ROADMAP.md](./ROADMAP.md) and
  `roadmap/*.md` (direction, one file per thread), or a dated plan or spec under
  `docs/` — nowhere else; a pointer to those files is fine, describing the
  future in place is not. Program-time "future events" and experiential copy
  ("you never know what's coming") are not future work.
- **This applies to code comments too, in both directions.** A comment says what
  the code does now — not what it replaced ("replaces the old spinners", "this
  used to…", "renamed from…"), and not what might come ("we'll add…", "for a
  future mode"). The past belongs in [CHANGELOG.md](./CHANGELOG.md) and git
  history; the future belongs in the files above. Both go stale, and neither
  helps someone reading the code in front of them. The exception is provenance
  that explains a live constraint — why code is shaped oddly _today_ — which is
  about the present and stays.
- README, MODES.md and `modes/*.md` are **user-facing**: no repo mechanics
  (committed/gitignored, generated modules, script internals) — that belongs in
  DEVELOPERS.md, ARCHITECTURE.md, or the code. npm commands a user runs to
  operate a feature are fine.
- **One source of truth.** A rule, list or procedure is stated in exactly one
  place and everywhere else points at it. Two copies drift, and nothing reports
  which one went stale. This file is the source for how work is done here; the
  `/…-check` skills say where to look for a breach, never what the rule is, so a
  rule added here is checked without touching them. Two exceptions, both of
  which still link the source: a user-facing doc restating a developer-facing
  rule in user terms, and a summary naming what a longer doc covers.
- **[modes/AUTOPILOT.md](./modes/AUTOPILOT.md) is a specification, not a
  description of code.** It records Autoblow's Autopilot, reverse-engineered
  from their client bundle, so it carries the constants instead of pointing at
  `autopilot-engine.ts`. Truth runs the other way here — the code must match the
  doc.
- When code you change is mentioned in a doc, updating the doc is part of the
  change. Run `/doc-check` before opening a PR — and again before merging — to
  catch what slipped.

## Writing style

How a sentence is written, wherever it sits: `*.md`, a code comment, a skill, a
commit message. Whether the sentence is _true_ belongs to → Documentation and
the checks that read against code; a sentence can be accurate and still break
every rule here. `/style-check` is the one that reads for these.

- **Documentation is precise.** It is instruction and reference, not prose —
  writing it as prose is what produces padding and hedging. Name the mechanism
  rather than personifying it: a repo, module, file or app does not want, know,
  care or try. Prefer the mechanism to a comparison, too. A metaphor that has
  become a term of art — backpressure, a hot path — is the concept's name and
  reads as one; use it. Do not coin one for the sentence: the reader decodes it
  into the mechanism, so write the mechanism. State what is true, not what is
  approximately true. Cut what carries no information: a sentence that loses
  nothing when deleted, an abstraction with no referent ("what the project is
  for", "the right shape"), a phrase restating the one before it.
- **Reference by name, never by position.** "The second paragraph", "checks
  1-7", "line 40", "the bullet below" — each is wrong as soon as anything is
  inserted, and nothing reports it. Point at a heading, an identifier or a
  filename. Where the target has no name, give it a heading rather than counting
  to it. (A `file:line` in a review finding is fine — it describes one moment,
  not a standing reference.)
- Docs speak the app's vocabulary — play mode, program, play/session — never a
  persona's fiction ("during a call" is the companions' own call framing), and
  capabilities belong to features, not to whichever companion has them.
- A companion is whatever gender their pack's author wrote. Anything describing
  companions in general — docs, changelog entries, code and field comments —
  says "they", or is written to need no pronoun. Copy about one named persona
  keeps that persona's own pronouns; the test is whether the sentence is about
  the app or about a character in it.

## Git workflow

- **Branch and PR what earns a changelog entry.** Anything a user or another
  developer would want recorded — behaviour, features, fixes, refactors — goes
  on a branch off `main`, one branch/PR per piece of work. Work that earns no
  entry doesn't earn the ceremony either: **never create a branch or PR just
  for** docs, comments, working-practice notes and the like — with no branch in
  flight they go straight to `main` once the gates pass. This is about not
  raising ceremony, not about where they land: when a branch already exists,
  they belong on it like any other commit. Never carve a doc change out of the
  branch you are working on to put it on `main`.
- **Process and working-practice rules aren't changelog entries.** How the work
  gets done isn't a change to the app; only code, docs and behaviour are.
- The flow is **branch → do the work → gates → commit → push → open a PR →
  merge**: push with `git push -u origin <branch>`, then open a PR against
  `main` with `gh pr create`.
- **Before opening a PR** (or marking a draft ready), the whole gate set passes:
  `npm run typecheck`, `lint` and `format` clean (see Verifying changes), tests
  run, the CHANGELOG entry written, and the five checks, **in this order**:
  `/code-check`, `/test-check`, `/doc-check`, `/style-check`, `/personal-check`.
  All five run on every branch: a check that only runs when someone judges it
  relevant is a check that never runs, and each one reports "nothing found"
  cheaply when a branch didn't go near its subject.
- **A check reports what it finds, including outside its own subject.** The
  divisions say what each one must not miss, never what it may pass over: two
  checks reporting one thing costs a duplicate line, and a check staying silent
  because another one owns it costs the finding. Say it and name whose it is.
- **The order matters**, because each check changes what the next one reads.
  `/code-check` settles what the code does, so the tests and docs are judged
  against code that is finished rather than code still moving. `/test-check`
  comes next because a test it rewrites is itself something the docs may
  describe. `/doc-check` then reads every doc and comment against a settled
  branch, establishing that they are true. `/style-check` follows, because the
  three before it all write new sentences while fixing what they find, and
  nothing else reads those. `/personal-check` is last so it sees the final text
  of everything the other four wrote — it is the only check whose miss can't be
  fixed after a push.
- **Before merging**, run all five again, in the same order — the branch has
  usually gained commits since the PR opened, and the PR's own title, body and
  comments didn't exist for the first run, so this is the only pass that ever
  reads them. Run them even on a branch that hasn't moved, and for the same
  reason as above: a re-run skipped on judgement is a re-run that never happens.
  Treat `gh pr merge` as blocked until all five have run against the final diff.
- **A check's report asks one thing at a time.** Never close a report with a
  blanket "shall I do these?". Take the recommendations in order and, for each,
  ask a question naming that one change and what it would assert — then stop and
  wait. Someone who has just read a page of findings cannot hold five decisions
  at once, and a digest followed by one open question is unanswerable. If the
  report ran long, restate the single change in the question rather than
  pointing back at it.
- **Check `main` hasn't moved** before pushing and again before merging:
  `git fetch origin && git log --oneline HEAD..origin/main` should be empty. If
  it isn't, merge `origin/main` into the branch and **verify nothing was lost**
  — don't trust a clean auto-merge. Git resolved a repo-wide reformat against a
  PR that landed mid-branch without reporting a single conflict on one file, and
  silently dropped a CSS utility the other PR had added; the feature using it
  would have shipped broken. Where a branch's own changes to a path are
  mechanical (formatting, renames), the reliable resolution is to take that path
  wholesale from `origin/main` and re-apply the mechanical change, then diff
  against `origin/main` to confirm only the intended difference remains.
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
  directory with the panel in `index.tsx` when it splits out per-concern pieces,
  as Goon and Companions do) owns its engine instance (a `useRef`), arms/plays
  the Player with it, holds its knob state (setting the engine's fields
  directly), and declares its commands. `usePlayer` (`src/hooks/use-player.ts`)
  mirrors the Player into React state **once** (in `page.tsx`) and the view is
  passed down to the panels. There is no per-play-mode Player hook (Companions'
  voice session has its own orchestrator hook, but the Player path is the same).
- **One Player = mutual exclusion; no runner**: the Player is the single path to
  the device and holds **one engine at a time** — a panel arming its engine
  replaces whoever was there, so "starting one stops the others" is a Player
  invariant, not a coordinator. Navigation, the global voice words and the
  play-mode registry all live in `src/app/page.tsx`; **adding a play mode** is a
  new engine + panel + one `PLAY_MODES` entry — the shape, and what is easy to
  get wrong about the pair, are in
  [ARCHITECTURE.md](./ARCHITECTURE.md#play-modes).
- **Commands are declared once**: each action is a `Command` (the type is
  commented in `src/hooks/use-voice-commands.ts`) — the button and the spoken
  word share one run handler and one enabled flag, so a disabled control is also
  out of the grammar. `useVoiceCommands` (`src/hooks/use-voice-commands.ts`)
  registers the active panel's enabled words with the recognizer and routes
  detections back.
- **Voice-first**: the app is operated hands-free, so nearly every interactive
  control should also be a voice command — when adding a control, give it a word
  (and the on-screen voice-command chip that comes with it) by default. The
  exceptions are free-text input (the safe word field) and continuous input
  better served by discrete step words (a slider gets `more`/`less`-style steps,
  not a spoken value).
- **Engines are intentionally self-contained**: they do not import from each
  other. Goon deliberately duplicates Groove's generation helpers rather than
  sharing a module — a chosen boundary, so don't refactor engines into a shared
  module without asking. The boundary is only about _generation_ code; shared
  infrastructure like the Player is fine.
- **One path for every browser**: the app targets Chromium, Firefox and WebKit,
  and a browser-specific branch is a last resort, not a first fix — it doubles
  the paths, and Playwright can't always reach the one that needs it (its WebKit
  has no working OPFS, so nothing Safari-only gets tested by anything but a
  human). When an API fails in one engine, look for the shape that works
  everywhere before writing a fallback: extraction sends the worker a pack key
  rather than a directory handle because WebKit won't structured-clone the
  handle, and that costs the other engines nothing. Take the branch only once no
  common path exists, and say in a comment which engine forced it.
- **The prompt prefix stays reusable**: a companion turn re-sends the whole
  conversation, and prefix caching matches from the first message to the first
  difference. Anything that changes per turn rides a trailing system message
  after the conversation (`liveStateMessage`), never the persona prompt — one
  volatile value there makes every token behind it uncacheable. Assembled
  prompts are filled once, at load (`fillSharedSections`). Nothing fails when
  this breaks; the Companions debug tab's "Prompt cached" row is the only
  symptom.
- **The safe word is always heard**: the app ignores `stop` in some states, and
  never ignores the safe word. Anything touching the grammar, the recognizer's
  lifetime, or the screens a word has to survive keeps that true.
- **Nothing derived is persisted**: one notion of a valid pack, rebuilt from the
  OPFS trees at every load, so no second store can drift out of step. A cache,
  index or summary written to disk needs an answer for the day it disagrees with
  its source.
- **Nothing is built before it's needed** (YAGNI): a field, hook, option or
  abstraction for a feature that does not exist yet doesn't land. Where data has
  to be captured early because backfilling it later is impractical —
  `contextWindow`, which every pack would otherwise need revisiting to supply —
  the definition site says why.
- **Keyword spotting drives the device**: there is **one** vosk recognizer,
  owned by `KeywordSpotterProvider` (`src/components/keyword-spotter.tsx`) at
  the top of `src/app/page.tsx` so it keeps running across screen changes. Its
  grammar is the active panel's enabled words (set via `setPlayModeKeywords`)
  plus the page's global words (`setGlobalWords`); components subscribe to
  detections with `keywordListener`.
