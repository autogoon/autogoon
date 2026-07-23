---
name: doc-check
description:
  Use before a PR is marked ready for review, after a rename or refactor, or
  whenever code and docs may have drifted apart — including stale paths, renamed
  identifiers, incomplete lists, or docs describing behaviour the code no longer
  has.
---

# Doc check

Verify the repo's documentation still tells the truth about the code, and that
it follows the documentation philosophy in CLAUDE.md (docs point at code; code
owns the what — docs own the why, the invariants, and the cross-file shape).

## Scope

- **Default: the branch.** `git diff main...HEAD --name-only` plus the
  identifiers the diff renamed, removed, or added. Then find every doc that
  mentions any of them: the docs are `*.md` at the root, `modes/*.md`,
  `roadmap/*.md`, and `.env.example` (its comments are the documented env
  contract).
- **Code comments are docs too, opportunistically.** While verifying a claim,
  a code comment that contradicts the code around it — or references something
  that no longer exists — is a finding, even though code files aren't swept.
- **`/doc-check all`: full sweep.** Every doc against the whole codebase. Fan
  out one read-only subagent per doc cluster (ARCHITECTURE + CLAUDE.md; README +
  MODES + DEVELOPERS; modes/; TODO + roadmap/; the dated specs under `docs/`)
  and collect their reports.

Two classes of doc, checked differently:

- **Future-friendly** — `TODO.md`, `ROADMAP.md` + `roadmap/*.md`, and the
  dated plans/specs under `docs/`. These describe intent and churn as plans
  change: only check the claims they make about the _current_ code ("Groove's
  floor is fixed at 60"), never flag unbuilt ideas.
- **Current-state** — literally everything else (README, ARCHITECTURE,
  CLAUDE.md, DEVELOPERS, MODES.md, `modes/*.md`). These describe **only what
  is implemented**, as it is today.

Current-state docs also split by **audience**: README, MODES.md and
`modes/*.md` are **user-facing** — written for someone using the app;
ARCHITECTURE.md, DEVELOPERS.md and CLAUDE.md are developer-facing.

`modes/AUTOPILOT.md` is deliberately exhaustive (the only record of the
reverse-engineered algorithm): its constants must match `autopilot-engine.ts`
exactly.

## What to check, per doc

1. **Paths and links** — every file path and markdown link target exists.
2. **Identifiers** — every named type, function, constant, prop, voice word and
   CSS/class reference exists with that exact name (grep, don't trust).
3. **Commands** — npm scripts, their described behaviour, and glob lists match
   `package.json`.
4. **Env vars** — names and semantics match `.env.example`.
5. **Enumerations** — lists of modes, tools, tabs, knobs, words are complete
   (the classic failure: a list written before the newest entry existed).
6. **Behavioural claims** — read the referenced code and confirm the sentence is
   still true.
7. **Philosophy** — flag any doc passage duplicating what the code already says
   (type blocks, argument shapes, model slugs, exhaustive knob lists) as a
   candidate to replace with a pointer to the source file.
8. **Future leakage** — in a current-state doc, any mention of planned or
   possible future work ("a future companion", "will gain", "eventually",
   "planned", "the next step is") is a finding, however small: move it to
   `TODO.md` or the roadmap, or delete it. A plain pointer _to_ those files is
   fine; describing the future in place is not. (Program-time "future events"
   and experiential "you never know what's coming" are not future work.)
9. **Audience** — user-facing docs speak to someone _using_ the app, so repo
   mechanics are findings there: what's committed or gitignored, generated
   modules and build plumbing, "see the header comments in scripts/…". That
   material belongs in DEVELOPERS.md, ARCHITECTURE.md, or the code itself. npm
   commands a user actually runs to operate a feature (the describe scripts,
   restarting dev) are fine — they're user instructions, not developer ones.
10. **Vocabulary & register** — docs use the app's terms: **play mode** (never
    "algorithm" as the category — it survives only where it genuinely means
    one, like "the Vacuglide algorithm"), **program** (the timed plan),
    **play/session** (what the user is doing). A persona's _fiction_ stays in
    persona copy — "during a call" belongs to Elise and Aimee's video-call
    framing, not to app documentation. And a capability is described as the
    feature's, not as belonging to whichever companion currently has it
    ("Companions can send pictures", not "Aimee can").

## Output and fixes

Report findings as `FILE:LINE — claim → what the code actually says → fix`, most
serious first. Then:

- **Fix directly:** stale paths, renamed identifiers, incomplete enumerations,
  factually wrong sentences.
- **Ask first:** restructuring a doc (converting duplicated detail to pointers)
  — that changes the doc's shape, not just its accuracy.

Run `npm run format` after edits. A clean run reports "no drift found" — don't
invent findings to seem useful.

## Red flags

| Thought                           | Reality                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| "The doc is roughly right"        | Roughly right is how drift compounds. Fix it now.           |
| "That claim is surely still true" | Renames just proved otherwise. Grep it.                     |
| "Nobody reads this doc"           | Claude reads it every session; wrong docs cause wrong code. |
