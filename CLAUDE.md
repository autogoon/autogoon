# CLAUDE.md

[ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md) describe the
whole app. Each play mode has its own doc — [modes/GOON.md](./modes/GOON.md),
[modes/GROOVE.md](./modes/GROOVE.md),
[modes/AUTOPILOT.md](./modes/AUTOPILOT.md),
[modes/COMPANIONS.md](./modes/COMPANIONS.md). Read the mode's doc before
changing that mode.

## Talking to me

- Follow the Writing style section below.
- Carry the evidence for an assertion: a file and line, a command's output, or a
  measurement.
- Cut anything that is not information.
- Quote a sentence, comment or small function verbatim in the reply. Name
  anything larger, and quote it on request.

## Writing style

- Use the app's vocabulary — play mode, program, play/session — never a
  persona's fiction ("during a call" is the companions' own framing).
  Capabilities belong to features, not to a companion that has them.
- A companion's gender is whatever the pack author wrote. Docs, changelog
  entries and code comments about companions in general say "they" or need no
  pronoun. Copy about one named persona uses that persona's pronouns.

## Commands

- `npm run dev` — Next dev server on http://localhost:8931, bound to `0.0.0.0`.
- `npm run build` — production build; runs `tsc`, catching RSC/Next issues the
  dev server tolerates.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint --max-warnings 0`.
- `npm run format` — reformats code and markdown; the globs are in
  `package.json`.

## Editing files

- Change files with Edit and Write only. Never a heredoc, `sed -i`, `perl -pi`,
  a redirect into a tracked path, or `git checkout --` over uncommitted work,
  because a shell rewrite shows no diff.
- Make several small Edit calls, not one script.
- Read-only shell commands (grep, tests) are fine.
- Never put a control character in a source file, because invisible bytes make
  the file binary to `grep`. Write an escape as `\x1b` and a separator as text.
- Take colour from [`scripts/lib/colour.ts`](./scripts/lib/colour.ts). The only
  other escape in the repo is the iTerm2 inline-image sequence in
  `scripts/describe-image.ts`.

## Never commit

The repo is public and pseudonymous. Never commit:

- real names, `/Users/<name>` or any machine-local path, personal emails or
  URLs, session links — write paths generically (`~/.claude/jobs/<job-id>/tmp`);
- a platform name in a downloading or collecting context, since the app is
  source-agnostic;
- anything describing the local media set under `goonpacks/<dir>/media/`
  (gitignored and personal) — write about the feature, never its contents;
- analysis of the author's legal exposure.

`/personal-check` is the backstop, not the defence. Once pushed, only a history
rewrite removes a leak.

## Verifying changes

- `npm test` — Jest. Tests are colocated and import from `@jest/globals`; the
  match set is in `jest.config.mjs`; Node is the default environment; a test
  rendering a hook or component opts into jsdom per file (see
  [DEVELOPERS.md](./DEVELOPERS.md#testing)).
- `npm run test:e2e` — Playwright, `tests/e2e/`, each spec on Chromium, Firefox
  and WebKit; starts or reuses the dev server on :8931.
- The voice e2e test fakes only the microphone, with a
  `MediaDevices.prototype.getUserMedia` stub playing a committed wav. Worklet,
  vosk and command routing are real.
- Read [DEVELOPERS.md#testing](./DEVELOPERS.md#testing) before writing a voice
  test: the stub's always-on silence source, the pre-pipeline activation click
  and the seeded listen-on-load preference are all required, and failures don't
  name them.
- A behaviour change requires `npm run typecheck`, `npm run build`, and manual
  browser testing.
- Fix every lint and typecheck warning, including pre-existing ones. The repo is
  at zero warnings.
- Before committing, run `npm run typecheck`, `npm run lint` and
  `npm run format`. Commit any formatting changes.
- Before opening a PR or marking a draft ready: typecheck, lint and format
  clean; `npm test` and `npm run test:e2e` run; the CHANGELOG entry written;
  `/personal-check` run last, so it reads every commit that will be pushed. Run
  `/personal-check` on every branch — it reports "nothing found" cheaply.
- Before merging, run `/personal-check` again against the final diff, PR title
  and comments. `gh pr merge` is blocked until it has run.

## Changelog

Keep [CHANGELOG.md](./CHANGELOG.md) current: every notable change gets an entry.
Update it after each logical set of changes, as part of the work, not at commit
or PR time.

- Link the PR in every entry:
  `([#N](https://github.com/autogoon/autogoon/pull/N))`, added once the PR
  exists.
- Write one bullet per change, wrapped over indented lines, with a blank line
  between. Newest date first under `## YYYY-MM-DD`. Within a day, order feature,
  enhancement, bug, internal.
- Use the form `- tag: **Short summary** — one or two sentences.` Inline markup
  is limited to `` `code` `` and `[links](url)`.
- Say what the app does in a user-facing entry, and what changed in a
  developer-facing one. Any tag can be developer-facing.
- Write one entry per branch feature, with supporting work (formats, validation,
  scripts) inside it. Independent changes get separate entries.
- State what changed and leave the detail to the PR: no mechanism, no list of
  parts, no branch history.
- Lead with the benefit; the cause is a trailing clause at most.
- Use the on-screen term (intro, pack, play mode) and say where in the UI it
  appears.
- Write a summary that identifies the change on its own.
- Make one point per entry, and don't assume the reader knows the thing
  described.
- Two sentences is normal. Longer is for a branch's whole feature, or for saying
  how finished it is.
- Give one concrete example instead of an enumeration.
- Point to docs for user-facing changes and to source files for developer-facing
  ones.
- Tag by who notices, not by what changed: a build that ships different files is
  an `enhancement` to pack builders.
- Tag `bug` only when the defect shipped on `main`. A regression fixed in the
  same PR gets no entry.
- Put no counts of tests, files or lines in an entry or a PR description.

## Git workflow

- Put anything earning a changelog entry on a branch off `main`, with a PR.
- Commit docs and comments to `main` directly, or to the active branch if one
  exists. Never open a branch or PR for them alone, and never carve them out of
  an active branch.
- Process and working-practice rules are not changelog entries.
- Follow the flow: branch → work → gates → commit →
  `git push -u origin <branch>` → `gh pr create` against `main` → merge.
- Report a valid finding even when it is outside a check's remit.
- Ask one thing at a time in a check's report: one recommendation, one question,
  then wait. No blanket questions.
- Carry one finding to a commit before naming the next: propose, wait, fix, ask
  to commit, commit.
- Before pushing and before merging,
  `git fetch origin && git log --oneline HEAD..origin/main` must be empty. If it
  is not, merge `origin/main` in and verify nothing was lost — don't trust a
  clean auto-merge. For mechanical changes (formatting, renames), take the path
  wholesale from `origin/main`, re-apply the change, and diff.
- Merge with a merge commit and delete the branch local and remote:
  `gh pr merge <n> --merge --delete-branch`.
- Treat committing, pushing and merging as separate actions. Do each only when
  asked.

## Voice-first in play

- Play is hands-free. Make nearly every screen control and navigation in play a
  voice command; a new one gets a word and an on-screen voice-command chip.
- Settings are not play. Keep preferences out of the grammar, because they carry
  a misrecognition risk. The other exceptions are free-text input (the safe
  word) and continuous input — sliders get `more`/`less`, not spoken values.

## Scope of a change

- Engines are self-contained. Don't refactor them into a shared module without
  asking.
- YAGNI: land no unneeded fields, hooks or abstractions. Data captured early to
  avoid impractical backfilling must say why at its definition site.
