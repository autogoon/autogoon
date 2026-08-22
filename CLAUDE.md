# CLAUDE.md

[ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md) are the app's
full picture. Read the play mode's own doc — [modes/GOON.md](./modes/GOON.md),
[modes/GROOVE.md](./modes/GROOVE.md),
[modes/AUTOPILOT.md](./modes/AUTOPILOT.md),
[modes/COMPANIONS.md](./modes/COMPANIONS.md) — before changing one.

## Talking to me

Replies in this conversation are held to → Writing style, like any other
sentence written here. Two things on top of it:

- **Precise, concise, technical.** An assertion carries its evidence: a file and
  line, a command's output, a measurement. Cut anything that is not information
  — flourish, a sentence restating the one before it, a summary of something
  short enough to quote.
- Quote verbatim in the reply itself. A sentence, comment, or small function
  goes in full; name larger changes rather than pasting them, and quote on
  request.

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

Shell rewrites render no diff and obscure changes. Use multiple small Edit calls
instead of one script. Shell commands that only read (greps, tests, etc.) are
unaffected.

**Never put a control character in a source file.** Write a terminal escape as
`\x1b` and a separator as text. Invisible bytes make files binary to `grep`.
Colour comes from [`scripts/lib/colour.ts`](./scripts/lib/colour.ts). The only
other escape in the repo is the iTerm2 inline-image sequence in
`scripts/describe-image.ts`.

## Secrets / environment

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

A behaviour change requires `npm run typecheck` + `npm run build`, and manual
browser testing.

The repo is kept at **zero warnings**. Fix every lint and typecheck warning or
error, including pre-existing ones.

Before committing, run `npm run typecheck`, `npm run lint`, and
`npm run format`. Commit any formatting changes.

## Changelog

Keep [CHANGELOG.md](./CHANGELOG.md) current. **It is there to be skimmed.**
Features and enhancements lead; bugs and internal entries follow. Update it
**after each logical set of changes** as part of the work itself. The timing
follows the work, not a commit or a PR, since a change can span several commits.
The entry still carries its PR link, and that can only go in once the PR exists,
usually mid-branch rather than at the end. If you finished something a user
would notice, it gets an entry before you consider the work done.

- **Format:** One bullet per change, wrapped over indented lines and separated
  by blank lines. Group newest first under the date (`## YYYY-MM-DD`). Order
  daily entries: `feature`, `enhancement`, `bug`, `internal`. Open each entry
  with a bold, short summary, then a sentence description:
  `- tag: **Add safe word** — Description…`. Link the PR:
  `([#N](https://github.com/autogoon/autogoon/pull/N))`. Inline markup is
  limited to `` `code` `` and `[links](url)`.
- **Every notable change gets an entry, described for its audience.**
  User-facing changes explain what the app does; developer-facing changes
  explain what changed. Any tag can apply to developer-facing changes.
- **One entry for the branch's feature, not one per piece of it.** Supporting
  work (formats, validation, scripts) belongs in the feature's entry.
  Independent changes get separate entries.
- **The entry says what changed; the PR it links carries the detail.** Don't
  explain the mechanism, list the parts, or narrate the branch history. Cut
  sentences that only matter to diff readers.
- **Lead with what you get, not what we did.** The summary and first sentence
  are the benefit; the cause is a clause at the end if it earns a mention.
  "Companions are off the MiniMax models" is a decision — what the reader
  noticed is a companion reading their own thinking out loud.
- **Name it what the app names it, and say where it is.** Use the on-screen term
  (intro, pack, play mode) and state where it appears. Conceptual descriptions
  without UI locations are unmappable.
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
- **Point rather than describe.** Point to documentation for user-facing
  changes, and source files for developer-facing ones.
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

## Writing style

- Docs speak the app's vocabulary — play mode, program, play/session — never a
  persona's fiction ("during a call" is the companions' own call framing), and
  capabilities belong to features, not to whichever companion has them.
- A companion is whatever gender their pack's author wrote. Anything describing
  companions in general — docs, changelog entries, code and field comments —
  says "they", or is written to need no pronoun. Copy about one named persona
  keeps that persona's own pronouns. The test is whether the sentence is about
  the app or about a character in it.

## Git workflow

- **Branch and PR what earns a changelog entry.** Put recorded changes
  (behaviour, features, fixes, refactors) on a branch off `main`. **Never create
  a branch or PR just for** docs or comments; commit them to `main` directly. If
  a branch already exists, add them there. Never carve doc changes out of an
  active branch.
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
  - `/personal-check`, run after everything else here so it reads every commit
    that will be pushed — its misses can't be fixed after a push.

  Run it on every branch. It reports "nothing found" cheaply when a branch
  didn't touch its subject.

- **Never discard a valid finding for being outside the check's remit.** Report
  it. A line that turns out not to matter costs nothing; a finding dropped
  because it looked like someone else's is lost.
- **Before merging**, run it again to catch new commits, PR titles, and
  comments. Treat `gh pr merge` as blocked until it has run against the final
  diff.
- **A check's report asks one thing at a time.** Propose one recommendation, ask
  a specific question, and wait. Never ask blanket questions ("shall I do
  these?").
- **One finding is carried to a commit before the next is named.** The cycle:
  propose, wait, fix, ask to commit, commit. Only then mention the next finding.
- **Check `main` hasn't moved** before pushing and before merging:
  `git fetch origin && git log --oneline HEAD..origin/main` should be empty. If
  it isn't, merge `origin/main` into the branch and **verify nothing was lost**.
  Don't trust a clean auto-merge. For mechanical changes (formatting, renames),
  take the path wholesale from `origin/main`, re-apply the change, and diff to
  confirm.
- Merge PRs with a **merge commit** (not squash or rebase) and **delete the
  branch, local and remote** — `gh pr merge <n> --merge --delete-branch`.
- Committing, pushing and merging are separate actions. Only do each when asked.

## Voice-first in play

Play is hands-free. Nearly every screen control and navigation should be a voice
command. When adding one, provide a word and on-screen voice-command chip by
default.

**Settings are not play.** Preferences are set once with a free hand; adding
them to the grammar risks misrecognition. Other exceptions are free-text input
(the safe word) and continuous input better served by step words (sliders get
`more`/`less`, not spoken values).

## Scope of a change

- **Engines are intentionally self-contained**: don't refactor them into a
  shared module without asking.
- **Nothing is built before it's needed** (YAGNI): unneeded fields, hooks, or
  abstractions don't land. If data must be captured early to avoid impractical
  backfilling, the definition site must explain why.
