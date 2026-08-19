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

## Voice-first in play

Play is operated hands-free, so nearly every control on a play mode's screens —
and the navigation that reaches them — should also be a voice command. When
adding one, give it a word (and the on-screen voice-command chip that comes with
it) by default.

**Settings are not play.** A preference is set once, with a free hand, and every
word in the grammar is another the recognizer can mishear mid-session. The other
exceptions are free-text input (the safe word field) and continuous input better
served by discrete step words (a slider gets `more`/`less`-style steps, not a
spoken value).

## Scope of a change

- **Engines are intentionally self-contained**: don't refactor them into a
  shared module without asking.
- **Nothing is built before it's needed** (YAGNI): a field, hook, option or
  abstraction for a feature that does not exist yet doesn't land. Where data has
  to be captured early because backfilling it later is impractical —
  `contextWindow`, which every pack would otherwise need revisiting to supply —
  the definition site says why.
