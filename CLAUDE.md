# CLAUDE.md

## Talking to me

Replies in this conversation are held to → Writing style, like any other
sentence written here. Two things on top of it:

- **Precise, concise, technical.** An assertion carries its evidence: a file and
  line, a command's output, a measurement. Cut anything that is not information
  — flourish, a sentence restating the one before it, a summary of something
  short enough to quote.
- **Anything proposed comes in four parts**, in this order:

  - the problem;
  - the current situation, with the evidence for it;
  - the proposed change, or the options with what each costs;
  - the resulting text, where it is short enough to read.

  Quote verbatim in the reply itself. A description of a change cannot be judged
  against the change, and `sed` or `cat` output in a tool call is not reliably
  shown to you. A sentence, a comment or a small function goes in full; anything
  larger is named rather than pasted, and quoted on request.

## Commands

- `npm run dev` — Next dev server on http://localhost:8931 (bound to `0.0.0.0`).
- `npm run build` — production build; also runs `tsc`, catching RSC/Next issues
  the dev server tolerates.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint --max-warnings 0`.
- `npm run format` — Reformats code and markdown documentation. The globs
  defining what it covers are in `package.json`.

## Editing files

Change files with **Edit and Write, never a shell rewrite**. None of these:

- a heredoc script;
- `sed -i`;
- `perl -pi`;
- a redirect into a tracked path;
- `git checkout --` over uncommitted work.

Those render no diff, so the change can't be reviewed and has to be taken on
trust from a summary. Batching several of them into one script is what makes a
bad edit hard to catch. Several small Edit calls beat one clever script. Shell
that only reads — greps, tests, mutation runs against a scratchpad copy — is
unaffected.

**Never put a control character in a source file.** Write a terminal escape as
`\x1b` and a separator as text. The byte itself is invisible in a diff, and one
of them makes the file binary to `grep`, which then reports no match for every
search over it. Colour comes from
[`scripts/lib/colour.ts`](./scripts/lib/colour.ts). The only other escape in the
repo is the iTerm2 inline-image sequence in `scripts/describe-image.ts`.

## Secrets / environment

### Keys

Real keys live in **`.env`** (gitignored via `.env` / `.env.*`), **not**
`.env.local`. Copy [`.env.example`](./.env.example) to `.env` and fill in real
values. Never commit a real key (the repo is public). Every var it documents is
read server-side only and none is `NEXT_PUBLIC_*`, so no secret reaches the
browser bundle.

### What must never be committed

This repo is **public and pseudonymous**. Never commit identifying details: real
names, `/Users/<name>` or other machine-local paths, personal emails or URLs,
session links. When a doc or plan needs a concrete path, genericize it
(`~/.claude/jobs/<job-id>/tmp`, not the real one). Also never:

- a platform name in a downloading or collecting context (the app is
  source-agnostic);
- anything describing the local media set under `goonpacks/<dir>/media/`
  (gitignored and personal — write about the feature, never its contents);
- analysis of the author's own legal exposure. `/personal-check` is the
  backstop, not the defence. History rewrites are the only fix once pushed.

## Verifying changes

- `npm test` — Jest unit tests (colocated, import from `@jest/globals`; the
  match set is in `jest.config.mjs`). Node is the default environment. A test
  that renders a hook or component opts into jsdom per file (see the Testing
  section in [DEVELOPERS.md](./DEVELOPERS.md#testing)).
- `npm run test:e2e` — Playwright (`tests/e2e/`), running each spec on real
  Chromium, Firefox and WebKit; starts (or reuses) the dev server on :8931. The
  voice test fakes only the microphone (a `MediaDevices.prototype.getUserMedia`
  stub playing a committed wav fixture). Everything downstream (worklet, vosk,
  command routing) is real. Read the Testing section in
  [DEVELOPERS.md](./DEVELOPERS.md#testing) before writing more voice tests: the
  stub's always-on silence source, the pre-pipeline activation click and the
  seeded listen-on-load preference are all required, and the test fails in ways
  that don't name them if any goes.

Tests are a floor, not the whole gate. The app drives physical hardware, so a
behaviour change also needs `npm run typecheck` + `npm run build`, and driving
the app in the browser and watching what it does.

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
  what that one pins. Never leave a contract that matters with no coverage.
- **A fake stands at a boundary** so a test can assert what the code sent across
  it, or so a module needing storage or a clock can run at all. A fake may
  supply the input, but the assertion must be on something the code under test
  produced. If replacing the code under test with a pass-through would leave the
  test passing, it asserts its own fixture and is a dud.
- **Fake the transport, never the reply.** A canned completion or transcript
  proves nothing about the pipeline that produces it. Exercise the LLM, TTS and
  STT in `tests/e2e/`. Faking what sits under them — the socket, the `fetch` —
  to assert what the code put on the wire, or how it behaves when the far end
  closes, is the permitted kind, and is often the only way to reach a lifecycle
  path at all.
- **Anything with a job has a test.** Doing I/O determines how a module is
  tested, never whether.
- **A test name stands alone.** `describe` is the exported symbol under test;
  `it` is a third-person sentence carrying its condition, so the two concatenate
  into one readable sentence in a failure list a year from now. Use real
  identifiers, never the shape of the assertion. No name defined by exclusion
  ("otherwise", "the rest"), none that only parses beside its neighbour. An
  "and" joining two unrelated behaviours means two tests; a compound describing
  one behaviour may keep it.
- **A test comment earns its place** in these situations only:

  - a file header saying what the file decides and what it delegates;
  - a fixture whose odd shape needs justifying;
  - a regression test naming the defect;
  - a cast inside a fake.

  Anything restating the test name goes.

- **An LLM's wording is not a contract; its shape is.** Assert the tool call
  parsed, the tool ran, the projected wire messages carry only what the model
  should see. For anything about content, assert only invariants that hold for
  any sane reply, and record the flake rate you measured.

The repo is kept at **zero warnings**. Fix every lint and typecheck warning or
error before you finish, including ones your direct changes didn't cause. Never
treat one as "pre-existing, not mine." Both `npm run lint` and
`npm run typecheck` produce no output when they pass.

Before committing — or at the latest before a finished PR is reviewed — run
`npm run typecheck`, `npm run lint`, and `npm run format`. If `format` changes
files, commit those changes as part of the work; don't leave them or revert
them.

## Changelog

Keep [CHANGELOG.md](./CHANGELOG.md) current. **It is there to be skimmed.**
Someone opening it wants to see what the app gained since they last looked, so
features and enhancements are what carry it. Bugs and internal entries are the
record behind them. Update it **after each logical set of changes** as part of
the work itself. The timing follows the work, not a commit or a PR, since a
change can span several commits. The entry still carries its PR link, and that
can only go in once the PR exists, usually mid-branch rather than at the end. If
you finished something a user would notice, it gets an entry before you consider
the work done.

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
  like) gets a developer-friendly description of _what changed_. That is not the
  same as being tagged `internal`: a feature, an enhancement or a bug can each
  be something only a developer would notice. Don't force a user angle onto a
  pure refactor, and don't drop a change just because users won't notice it.
- **One entry for the branch's feature, not one per piece of it.** The work a
  feature needed to exist — the format it stores, the validation, the script
  that writes it — is the feature, and goes in its entry. Something that stands
  on its own still earns its own entry on the same branch. The test is whether
  it means anything to someone who doesn't care about the feature.
- **The entry says what changed; the PR it links carries the detail.** Don't
  explain the mechanism, list the parts, or narrate how the branch arrived at
  it. If a sentence would only matter to someone reading the diff, cut it.
- **Lead with what you get, not what we did.** The summary and first sentence
  are the benefit; the cause is a clause at the end if it earns a mention.
  "Companions are off the MiniMax models" is a decision — what the reader
  noticed is a companion reading their own thinking out loud.
- **Name it what the app names it, and say where it is.** If there is a word on
  screen for the thing — an intro, a pack, a play mode — use it, and say where
  it appears. An entry describing the concept, or naming it with no way to find
  it, is unmappable — including by whoever wrote it.
- **The summary alone says what the change is.** Read it with the description
  covered — if it doesn't identify the change, rewrite it. "A companion finds a
  picture whatever you call it" names nothing; "Synonyms added to media search"
  does.
- **An entry makes one point, and can't assume the thing it describes.** Folding
  a feature's parts into one entry is not the same as listing them: four facts
  about a tool the reader has never heard of is a changelog of the tool.
- **Two sentences is the normal size.** Longer has to earn it — the branch's
  whole feature, or saying how finished something is.
- **One concrete example beats the options it stands for.** "No 'good morning'
  at your midnight" does the work of a sentence enumerating what a pack author
  can turn off.
- **Point rather than describe.** Documentation for anything user-facing, the
  source file for anything only a developer would notice — by who reads it, not
  which tag it wears.
- **Tag by who notices, not by what changed.** A build that ships different
  files is an `enhancement` to whoever builds packs, not `internal`.
- **Only tag a `bug` if it shipped on `main`.** A regression introduced _and_
  fixed within the same PR is not a changelog bug — leave it out; the net
  user-facing feature/enhancement line already covers the behaviour.
- **No counts that the next commit invalidates** — test totals, suite counts,
  file counts, line counts. Any commit moves them, nothing checks them, and a
  number that has silently gone wrong is worse than no number. This applies to
  PR descriptions too. Say what changed and why it matters: "the tests that
  couldn't fail are gone" stays true, "262 tests became 413" is wrong by the
  afternoon.

## Documentation

Readable, usable documentation is the primary goal, for users and developers
alike. Never compromise on it.

Docs point at code; they don't duplicate it. **Code owns the what** — type
fields, signatures, tool lists, knob ranges, model slugs, defaults — explained
by comments at the definition site. **Docs own what code can't say** — intent,
invariants, the why, and the cross-file shape. Concretely:

- Never copy a type, command list, or config value into a doc. Link the source
  file and say what it's for ("the fields are commented there").
- If a sentence goes stale when someone renames a field or adds an entry, it's
  implementation detail. Replace it with a pointer.
- Current-state docs describe **only what's implemented**. Future work lives in
  one of these, and nowhere else:

  - [TODO.md](./TODO.md) — new features, additions and changes meant for soon.
  - [BUG.md](./BUG.md) — known defects in behaviour that is already implemented.
  - [ROADMAP.md](./ROADMAP.md) and `roadmap/*.md` — longer-term features and
    direction, one file per thread.
  - A dated plan or spec under `docs/`.

  A pointer to those files is fine; describing the future in place is not.
  Program-time "future events" and experiential copy ("you never know what's
  coming") are not future work.

  A way to think about it:

  - ROADMAP.md says what could be, framed in how things are.
  - TODO.md how they should be.
  - BUG.md how they shouldn't be.

- **This applies to code comments too, in both directions.** A comment says what
  the code does now — not what it replaced ("replaces the old spinners", "this
  used to…", "renamed from…"), and not what might come ("we'll add…", "for a
  future mode"). The past belongs in [CHANGELOG.md](./CHANGELOG.md) and git
  history; the future belongs in TODO.md, BUG.md, ROADMAP.md or a dated plan
  under `docs/`. Both go stale, and neither helps someone reading the code in
  front of them. The exception is provenance that explains a live constraint —
  why code is shaped oddly _today_. That is about the present and stays.
- README, MODES.md and `modes/*.md` are **user-facing**: no repo mechanics
  (committed/gitignored, generated modules, script internals). That belongs in
  DEVELOPERS.md, ARCHITECTURE.md, or the code — and a user is never sent there
  to find out how to use the app. npm commands a user runs to operate a feature
  are fine.
- **One source of truth.** A rule, list or procedure is stated in exactly one
  place and everywhere else points at it. Two copies drift, and nothing reports
  which one went stale. This file is the source for how work is done here. The
  `/…-check` skills say where to look for a breach, never what the rule is, so a
  rule added here is checked without touching them. A restatement pitched above
  its source is not a copy: a user-facing doc putting a developer-facing rule in
  user terms, a summary naming what a longer doc covers, a section's opening
  carrying what its bullets spell out. Someone skimming reads one and someone
  applying the rule reads the other. Pitch it high enough that a change to the
  detail below leaves it true, and where the two sit in different files, link
  the source. This rule is about two statements of the same detail — there, one
  of them goes.
- **Repeated duplication between the same two documents means their scopes
  overlap.** Deleting each duplicated passage leaves the overlap, so the next
  one duplicates too. Settle what each document covers and move whole sections
  rather than sentences.
- **[modes/AUTOPILOT.md](./modes/AUTOPILOT.md) records an algorithm this repo
  does not own.** Autoblow's client bundle is the specification and is not
  published. `autopilot-engine.ts` is derived from reading it, and the doc from
  the engine. The doc carries the constants rather than pointing at the engine
  because they record the original. Where the doc and the engine disagree,
  neither settles it. Re-read the bundle. The doc describes the patterns as
  templates, not as playback runs them, so it is the likelier of the two to have
  lost a detail.
- **[GOONPACKS.md](./GOONPACKS.md) is the pack format's reference for authors.**
  A pack author does not read TypeScript, so the field-by-field prose lives
  there, while `src/lib/goonpacks/manifest.ts` carries the types and the terse
  comments a developer reads. Where the two disagree, the parser settles it: it
  is what rejects a pack. `modes/*.md` states its play mode's engine values —
  speed ranges, dip floors, durations, knob defaults — because a user reading
  what a play mode does is not reading the engine. Changing one in the engine
  changes it there too, in the same commit.
- When code you change is mentioned in a doc, updating the doc is part of the
  change.
- **Not every exception can be codified.** Readability is what these rules and →
  Writing style are for. Where following one makes a page read worse, break it.

## Writing style

How text is written, wherever it sits: `*.md`, a code comment, a skill, a commit
message, a reply in this conversation. Whether it is _true_ belongs to →
Documentation and the checks that read against code. Text can be accurate and
still break every rule here. `/style-check` reads for these.

- **Documentation is precise.** It is instruction and reference, not prose.
  Writing it as prose is what produces padding and hedging. Name the mechanism
  rather than personifying it: a repo, module, file or app does not want, know,
  care or try. Prefer the mechanism to a comparison, too. A metaphor that has
  become a term of art — backpressure, a hot path — is the concept's name and
  reads as one. Use it. Do not coin one for the sentence. The reader decodes it
  into the mechanism, so write the mechanism. State what is true, not what is
  approximately true. Cut what carries no information: a sentence that loses
  nothing when deleted, an abstraction with no referent ("what the project is
  for", "the right shape"), a phrase restating the one before it. Be ruthless
  about this.
- **Reference by name, never by position.** "The second paragraph", "checks
  1-7", "line 40", "the bullet below" — each is wrong as soon as anything is
  inserted, and nothing reports it. Point at a heading, an identifier or a
  filename. Where the target has no name, give it a heading rather than counting
  to it. (A `file:line` in a review finding is fine. It describes one moment,
  not a standing reference.)
- **A list gets bullets.** Three or more items run together in a sentence become
  a bulleted list. A comma-separated run can't be scanned, and a sentence
  pointing back at it — "the four levers", "the last one" — can't be matched to
  an item without reading the whole run again. Two things named in a sentence
  are not a list.
- **A construction repeated down a page becomes a register.** One shape used for
  every sentence reads as talk, however well each sentence carries on its own.
  The recurring shape here is a claim, a gloss on it, then a trailing
  consequence. The gloss arrives on dashes, a colon or a comma. The consequence
  arrives on `so…` or `which is…`. Use the shape where the reader needs it, not
  by default. Reference prose states a thing and stops.
- Docs speak the app's vocabulary — play mode, program, play/session — never a
  persona's fiction ("during a call" is the companions' own call framing), and
  capabilities belong to features, not to whichever companion has them.
- A companion is whatever gender their pack's author wrote. Anything describing
  companions in general — docs, changelog entries, code and field comments —
  says "they", or is written to need no pronoun. Copy about one named persona
  keeps that persona's own pronouns. The test is whether the sentence is about
  the app or about a character in it.

## Git workflow

- **Branch and PR what earns a changelog entry.** Anything a user or another
  developer would want recorded — behaviour, features, fixes, refactors — goes
  on a branch off `main`, one branch/PR per piece of work. Work that earns no
  entry doesn't earn the ceremony either: **never create a branch or PR just
  for** docs, comments, working-practice notes and the like. With no branch in
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

  - `npm run typecheck`, `lint` and `format` clean;
  - `npm test` and `npm run test:e2e` both run (see Verifying changes for what
    each covers);
  - the CHANGELOG entry written;
  - the five checks, **in this order**: `/code-check`, `/test-check`,
    `/doc-check`, `/style-check`, `/personal-check`.

  All five run on every branch. A check that only runs when someone judges it
  relevant is a check that never runs, and each one reports "nothing found"
  cheaply when a branch didn't go near its subject.

- **Never discard a valid finding for being outside the check's remit.** Report
  it. A duplicate line costs nothing; a finding dropped because another check
  owns it is lost.
- **The order matters**, because each check changes what the next one reads.
  `/code-check` settles what the code does, so the tests and docs are judged
  against code that is finished rather than code still moving. `/test-check`
  comes next because a test it rewrites is itself something the docs may
  describe. `/doc-check` then reads every doc against a settled branch,
  establishing that they are true. Comments divide: `/code-check` takes each one
  the diff touched against the code beneath it, `/test-check` those in test
  files, and `/doc-check` whether a comment still describes the repo around it.
  `/style-check` follows, because the three before it all write new sentences
  while fixing what they find, and nothing else reads those. `/personal-check`
  is last so it reads the final text of everything the other four wrote. It is
  the only check whose miss can't be fixed after a push.
- **Before merging**, run all five again, in the same order. The branch has
  usually gained commits since the PR opened, and the PR's own title, body and
  comments didn't exist for the first run, so this is the only pass that ever
  reads them. Run them even on a branch that hasn't moved, for the same reason.
  Treat `gh pr merge` as blocked until all five have run against the final diff.
- **A check's report asks one thing at a time.** Never close a report with a
  blanket "shall I do these?". Take the recommendations in order and, for each,
  ask a question naming that one change and what it would assert — then stop and
  wait. Someone who has just read a page of findings cannot hold five decisions
  at once, and a digest followed by one open question is unanswerable. If the
  report ran long, restate the single change in the question rather than
  pointing back at it.
- **One finding is carried to a commit before the next is named.** The cycle is
  propose, wait for a yes or no, fix, then commit on a second yes. Only then
  does the next finding get mentioned. An edit made ahead of its yes, or a
  commit question carrying the next proposal, puts two findings in flight at
  once. Every answer then has to say which one it meant, and a change that needs
  re-doing can't be backed out cleanly.
- **Check `main` hasn't moved** before pushing and again before merging:
  `git fetch origin && git log --oneline HEAD..origin/main` should be empty. If
  it isn't, merge `origin/main` into the branch and **verify nothing was lost**.
  Don't trust a clean auto-merge. Git resolved a repo-wide reformat against a PR
  that landed mid-branch without reporting a single conflict on one file, and
  silently dropped a CSS utility the other PR had added. The feature using it
  would have shipped broken. Where a branch's own changes to a path are
  mechanical (formatting, renames), the reliable resolution is to take that path
  wholesale from `origin/main` and re-apply the mechanical change, then diff
  against `origin/main` to confirm only the intended difference remains.
- Merge PRs with a **merge commit** (not squash or rebase) and **delete the
  branch, local and remote** — `gh pr merge <n> --merge --delete-branch`.
- Committing, pushing and merging are separate actions. Only do each when asked.

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
  channels: `generateSpeed` (stateful) and `generateValves` (a _pure_ overlay
  laid across a span of already-built speed), so the Player can re-lay valves
  over an unchanged speed script (`invalidateValves()`) for a valve-only knob
  like Autopilot's vacuum maintenance. The one shared **Player**
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
  the device and holds **one engine at a time**. A panel arming its engine
  replaces whatever engine was armed, so "starting one stops the others" is a
  Player invariant, not a coordinator. Navigation, the global voice words and
  the play-mode registry all live in `src/app/page.tsx`. **Adding a play mode**
  is a new engine + panel + one `PLAY_MODES` entry. The shape, and what is easy
  to get wrong about the pair, are in
  [ARCHITECTURE.md](./ARCHITECTURE.md#play-modes).
- **Commands are declared once**: each action is a `Command` (the type is
  commented in `src/hooks/use-voice-commands.ts`). The button and the spoken
  word share one run handler and one enabled flag, so a disabled control is also
  out of the grammar. `useVoiceCommands` registers the active panel's enabled
  words with the recognizer and routes detections back.
- **Voice-first in play**: play is operated hands-free, so nearly every control
  on a play mode's screens — and the navigation that reaches them — should also
  be a voice command. When adding one, give it a word (and the on-screen
  voice-command chip that comes with it) by default. **Settings are not play.**
  A preference is set once, with a free hand, and every word in the grammar is
  another the recognizer can mishear mid-session. The other exceptions are
  free-text input (the safe word field) and continuous input better served by
  discrete step words (a slider gets `more`/`less`-style steps, not a spoken
  value).
- **Engines are intentionally self-contained**: they do not import from each
  other. Goon duplicates Groove's generation helpers rather than sharing a
  module, a chosen boundary. Don't refactor engines into a shared module without
  asking. The boundary is only about _generation_ code; shared infrastructure
  like the Player is fine.
- **One path for every browser**: the app targets Chromium, Firefox and WebKit,
  and a browser-specific branch is a last resort, not a first fix. It doubles
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
  after the conversation (`liveStateMessage`), never the persona prompt. One
  volatile value there makes every token behind it uncacheable. Assembled
  prompts are filled once, at load (`fillSharedSections`). Nothing fails when
  this breaks. The Companions debug tab's "Prompt cached" row is the only
  symptom.
- **The safe word is never gated**: it is in the grammar the whole time
  something is playing, including the states where a panel disables its own
  `stop`. Anything touching the grammar, the recognizer's lifetime, or the
  screens a word has to survive keeps that true. The one case outside it is the
  microphone being off. No word reaches the app at all then.
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
  plus the page's global words (`setGlobalWords`). Components subscribe to
  detections with `keywordListener`.
