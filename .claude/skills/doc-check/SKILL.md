---
name: doc-check
description:
  Use before opening a PR and again before merging it, after a rename or
  refactor, or whenever code and docs may have drifted apart — including stale
  paths, renamed identifiers, incomplete lists, or docs describing behaviour the
  code no longer has.
---

# Doc check

Verify the repo's documentation is still true about the code, and that it
follows [CLAUDE.md](../../../CLAUDE.md) → Documentation.

What this check must not miss has a right answer in another file: a path that no
longer resolves, an identifier that was renamed, a claim the code stopped
supporting, a rule stated here and in CLAUDE.md both. How a sentence is
_written_ is another check's subject.

## Scope

- **Default: the branch.** `git diff main...HEAD --name-only`, plus the
  identifiers the diff renamed, removed or added. Find every doc mentioning any
  of those paths or identifiers, within [The document set](#the-document-set).
- **Code comments are docs too.** **Every comment the diff touched is in
  scope**, whatever file it sits in. Which check reads a comment for what is in
  [CLAUDE.md](../../../CLAUDE.md) → Git workflow. Beyond the diff, code files
  still aren't swept — flag a comment opportunistically, while verifying
  something else.
- **`/doc-check all`: full sweep.** Every document in
  [The document set](#the-document-set), against the whole codebase. How the
  sweep is run — one agent per file, in what order, and what to brief each with
  — is [md-check](../md-check/SKILL.md)'s to say.

## The document set

A document's class decides how it is read; its audience decides what may appear
in it ([CLAUDE.md](../../../CLAUDE.md) → Documentation). Where the table and
that file disagree, that file wins:

|                                                         | class         | audience  |
| ------------------------------------------------------- | ------------- | --------- |
| README.md, MODES.md, `modes/*.md`                       | current-state | user      |
| ARCHITECTURE.md, DEVELOPERS.md, INFERENCE.md, CLAUDE.md | current-state | developer |
| GOONPACKS.md, CHANGELOG.md                              | current-state | both      |
| `.env.example`                                          | current-state | developer |
| `.claude/skills/*/SKILL.md`                             | current-state | developer |
| `src/inference/experiments/*/README.md`                 | current-state | developer |
| TODO.md, BUG.md, ROADMAP.md, `roadmap/*.md`             | future        | developer |
| dated plans and specs under `docs/`                     | future        | developer |

`.env.example`'s comments are the documented env contract.
`goonpacks/*/system-prompt.md` is a pack's persona prompt and
`scripts/md-sweep-briefs/*.md` are the documentation sweep's prompts — neither
is documentation, and both are out of scope here.

Enumerate the set from `git ls-files '*.md'`, never from the table. A file with
no row is a finding against the table.

**Current-state** and **future** docs are distinguished in
[CLAUDE.md](../../../CLAUDE.md) → Documentation. In a future doc, check only the
claims it makes about the _current_ code ("Groove's floor is fixed at 60"),
never flag an unbuilt idea.

`modes/AUTOPILOT.md` records an algorithm this repo does not own —
[CLAUDE.md](../../../CLAUDE.md) → Documentation says what settles a disagreement
between it and the code.

## What to check, per doc

**Every rule in [CLAUDE.md](../../../CLAUDE.md) → Documentation and → Changelog
is a check.** They are not repeated here. A rule added to either is checked
without this file changing.

Plus these:

1. **Paths and links** — every file path, markdown link and heading anchor
   resolves.
2. **Identifiers** — every named type, function, constant, prop, voice word and
   CSS/class reference exists with that exact name (grep, don't trust).
3. **Commands** — npm scripts, their described behaviour, and glob lists match
   `package.json`.
4. **Env vars** — names and semantics match `.env.example`.
5. **Enumerations** — for any list of modes, tools, tabs, knobs, words, globs or
   config values, ask in this order: should it exist at all (CLAUDE.md →
   Documentation), and only then, is it complete? Asking only about completeness
   passes a copy and misses the defect.
6. **Behavioural claims** — read the referenced code and confirm the sentence is
   still true.
7. **Duplication** — a rule, list or procedure this doc states that another
   states too. Grep CLAUDE.md and the doc's siblings for the sentence's
   _subject_, not its wording; a copy is usually reworded. Quote both copies
   side by side and say which is the source.

## Output and fixes

Report findings as
`FILE:LINE — claim → what the code or the other document actually says → fix`,
most serious first. A duplication finding quotes both copies. Then:

- **Fix directly:** stale paths, renamed identifiers, incomplete enumerations,
  factually wrong sentences.
- **Ask first:** restructuring a doc (converting duplicated detail to pointers)
  — that changes the doc's shape, not just its accuracy.

Put those questions **one at a time**, in the four-part form —
[CLAUDE.md](../../../CLAUDE.md) → Git workflow and → Talking to me.

Run `npm run format` after edits. A clean run reports "no findings", alongside
what was read — don't invent findings to seem useful, and don't leave a clean
report indistinguishable from a skipped one.

## Red flags

| Thought                           | Reality                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| "The doc is roughly right"        | Roughly right is how drift compounds. Fix it now.           |
| "That claim is surely still true" | Renames just proved otherwise. Grep it.                     |
| "Nobody reads this doc"           | Claude reads it every session; wrong docs cause wrong code. |
