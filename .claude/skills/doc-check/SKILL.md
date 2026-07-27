---
name: doc-check
description:
  Use before opening a PR and again before merging it, after a rename or
  refactor, or whenever code and docs may have drifted apart — including stale
  paths, renamed identifiers, incomplete lists, or docs describing behaviour the
  code no longer has.
---

# Doc check

Verify the repo's documentation still tells the truth about the code, and that
it follows [CLAUDE.md](../../../CLAUDE.md) → Documentation.

**Documentation is instruction and reference, not prose. Precision, not
flourish.** Deliberately duplicated here due to its importance: it is the rule
most often broken and the hardest to see — written as prose, documentation
acquires padding, hedging and sentences that carry nothing.

## Scope

- **Default: the branch.** `git diff main...HEAD --name-only` plus the
  identifiers the diff renamed, removed, or added. Then find every doc that
  mentions any of them: the docs are `*.md` at the root, `modes/*.md`,
  `roadmap/*.md`, and `.env.example` (its comments are the documented env
  contract).
- **Code comments are docs too.** **Every comment the diff touched is in
  scope**, whatever file it sits in: if the branch wrote or edited it, read it
  as a doc — how it is written, what it names, and whether it still describes
  the repo around it. Whether it tells the truth about the code directly beneath
  it is `/code-check`'s, which reads that hunk anyway; everything else about it
  is here. Beyond the diff, code files still aren't swept — flag those
  opportunistically, while verifying something else.
- **`/doc-check all`: full sweep.** Every doc in the set above, against the
  whole codebase. Fan out one read-only subagent per cluster and collect their
  reports; cover the set exactly, with no doc in two clusters and none left out.

The set splits three ways, and a doc's place decides how it is read:

|                                           | class         | audience  |
| ----------------------------------------- | ------------- | --------- |
| README.md, MODES.md, `modes/*.md`         | current-state | user      |
| ARCHITECTURE.md, DEVELOPERS.md, CLAUDE.md | current-state | developer |
| CHANGELOG.md                              | current-state | both      |
| `.env.example`                            | current-state | developer |
| TODO.md, ROADMAP.md, `roadmap/*.md`       | future        | developer |
| dated plans and specs under `docs/`       | future        | developer |

**Current-state** docs describe only what is implemented today. **Future** docs
describe intent and churn as plans change: check only the claims they make about
the _current_ code ("Groove's floor is fixed at 60"), never flag an unbuilt
idea.

`modes/AUTOPILOT.md`'s constants must match `autopilot-engine.ts` exactly.

## What to check, per doc

**Every rule in [CLAUDE.md](../../../CLAUDE.md) → Documentation and → Changelog
is a check.** Read them there. They are not repeated here, so a rule added to
either is checked without this file changing.

Plus these, which answer to no rule: verifications nothing in CLAUDE.md would
tell you to perform.

1. **Paths and links** — every file path, markdown link and heading anchor
   resolves.
2. **Identifiers** — every named type, function, constant, prop, voice word and
   CSS/class reference exists with that exact name (grep, don't trust).
3. **Commands** — npm scripts, their described behaviour, and glob lists match
   `package.json`.
4. **Env vars** — names and semantics match `.env.example`.
5. **Enumerations** — for any list of modes, tools, tabs, knobs, words, globs or
   config values, ask in this order: should it exist, and only then, is it
   complete? A list copied out of a source file is a finding whether or not it
   is currently accurate — checking it for completeness passes the copy and
   misses the defect. A list the reader is the audience for stays, and is
   checked against the code for entries added since it was written.
6. **Behavioural claims** — read the referenced code and confirm the sentence is
   still true.

## Output and fixes

Report findings as `FILE:LINE — claim → what the code actually says → fix`, most
serious first. Then:

- **Fix directly:** stale paths, renamed identifiers, incomplete enumerations,
  factually wrong sentences.
- **Ask first:** restructuring a doc (converting duplicated detail to pointers)
  — that changes the doc's shape, not just its accuracy.

Put those questions **one at a time** — [CLAUDE.md](../../../CLAUDE.md) → Git
workflow.

Run `npm run format` after edits. A clean run reports "no drift found" — don't
invent findings to seem useful.

## Red flags

| Thought                           | Reality                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| "The doc is roughly right"        | Roughly right is how drift compounds. Fix it now.           |
| "That claim is surely still true" | Renames just proved otherwise. Grep it.                     |
| "Nobody reads this doc"           | Claude reads it every session; wrong docs cause wrong code. |
