---
name: doc-check
description: Use before a PR is marked ready for review, after a rename or refactor, or whenever code and docs may have drifted apart — including stale paths, renamed identifiers, incomplete lists, or docs describing behaviour the code no longer has.
---

# Doc check

Verify the repo's documentation still tells the truth about the code, and that
it follows the documentation philosophy in CLAUDE.md (docs point at code; code
owns the what — docs own the why, the invariants, and the cross-file shape).

## Scope

- **Default: the branch.** `git diff main...HEAD --name-only` plus the
  identifiers the diff renamed, removed, or added. Then find every doc that
  mentions any of them: the docs are `*.md` at the root, `modes/*.md`, and
  `roadmap/*.md`.
- **`/doc-check all`: full sweep.** Every doc against the whole codebase. Fan
  out one read-only subagent per doc cluster (ARCHITECTURE + CLAUDE.md;
  README + MODES + DEVELOPERS; modes/; roadmap/) and collect their reports.

`roadmap/*.md` describe future intent — only check their claims about the
*current* code ("Groove's floor is fixed at 60"), never flag unbuilt ideas.
`modes/AUTOPILOT.md` is deliberately exhaustive (the only record of the
reverse-engineered algorithm): its constants must match `autopilot-engine.ts`
exactly.

## What to check, per doc

1. **Paths and links** — every file path and markdown link target exists.
2. **Identifiers** — every named type, function, constant, prop, voice word
   and CSS/class reference exists with that exact name (grep, don't trust).
3. **Commands** — npm scripts, their described behaviour, and glob lists match
   `package.json`.
4. **Env vars** — names and semantics match `.env.example`.
5. **Enumerations** — lists of modes, tools, tabs, knobs, words are complete
   (the classic failure: a list written before the newest entry existed).
6. **Behavioural claims** — read the referenced code and confirm the sentence
   is still true.
7. **Philosophy** — flag any doc passage duplicating what the code already
   says (type blocks, argument shapes, model slugs, exhaustive knob lists) as
   a candidate to replace with a pointer to the source file.

## Output and fixes

Report findings as `FILE:LINE — claim → what the code actually says → fix`,
most serious first. Then:

- **Fix directly:** stale paths, renamed identifiers, incomplete enumerations,
  factually wrong sentences.
- **Ask first:** restructuring a doc (converting duplicated detail to
  pointers) — that changes the doc's shape, not just its accuracy.

Run `npm run format` after edits. A clean run reports "no drift found" — don't
invent findings to seem useful.

## Red flags

| Thought | Reality |
| --- | --- |
| "The doc is roughly right" | Roughly right is how drift compounds. Fix it now. |
| "That claim is surely still true" | Renames just proved otherwise. Grep it. |
| "Nobody reads this doc" | Claude reads it every session; wrong docs cause wrong code. |
