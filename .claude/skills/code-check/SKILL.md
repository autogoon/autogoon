---
name: code-check
description:
  Use before opening a PR and again before merging it — reads the branch against
  what this project is trying to be, and flags anything working against it. Not
  a checklist; the entries below are wants and reasons, and a finding can be
  something they don't mention.
---

# Code check

`/doc-check` reads the docs, `/test-check` reads the tests, `/personal-check`
reads for leaks. This one reads the code against what the project is _for_.

**It is not a checklist.** What follows is what this repo wants and why. A
finding is anything in the branch that works against one of them — including
something described nowhere below. If this list is all you look at, the skill
has failed at its job.

## Scope

- **Every branch**, `git diff main...HEAD`. A check applied only when someone
  judges it relevant is a check that never runs; where a branch went near none
  of this, "no findings" costs a minute.
- **`/code-check all`** reads the whole codebase rather than the diff.

## What this project wants

**The prompt prefix stays reusable.** Every turn re-sends the whole conversation
— that is a given, and shortening it is a different question, already recorded
in [TODO.md](../../../TODO.md) as context compaction. What matters here is that
the part which has _not_ changed is still recognisable as unchanged. Caching
matches from the first message and stops at the first difference, so one
per-turn value above the conversation turns a cheap re-send into a full re-read,
every turn. Anything that changes per turn goes after the conversation, never
into the prompt — `liveStateMessage` in
[shared-prompt.ts](../../../src/lib/companions/shared-prompt.ts) has the
mechanics. Nothing fails when this breaks; the debug tab's "Prompt cached"
figure is the only symptom.

**Secrets never leave the server.** The paid keys are read server-side only, and
the access gate fails closed — empty config means nothing validates. A key
reaching the client, a gate that opens when unconfigured, or a route that spends
a key before checking, is the most serious finding available here.

**One path for every browser.** Chromium, Firefox and WebKit. A per-engine
branch doubles the paths and Playwright's WebKit often cannot reach the one that
needed it, so it is a last resort — look for the shape that works everywhere
first, and where a branch is genuinely forced, say in a comment which engine
forced it.

**The safe word works whatever else is broken.** The app decides to ignore Stop
sometimes; it never decides to ignore the safe word. Anything that could leave
it unheard — the grammar it's in, the recognizer's lifetime, a screen that
swallows it, storage that loses it — is a safety finding, not a polish one.

**Nothing derived is persisted.** One notion of a valid pack, rebuilt from the
trees at every load, so there is no second store to drift out of step. A cache,
index or summary written to disk is a drift source: ask what happens the day it
disagrees with its source.

**Engines stay independent.** The play-mode engines don't import each other —
Goon duplicates Groove's generation helpers on purpose. Shared _infrastructure_
(the Player, program types) is fine; shared _generation_ is the boundary.

## Reporting

`FILE:LINE — what it does → which want it undercuts → what it costs.` Worst
first, and each with evidence: a line, a measurement, or a request you actually
assembled. Reasoning from the code alone is where invented findings come from.

**Something already recorded in [TODO.md](../../../TODO.md) or the roadmap is
not a finding.** Nor is a field or hook plumbed ahead of the feature that will
read it. Check TODO.md before reporting anything that looks like a gap rather
than a mistake.

- **Fix directly:** the change is contained and the intent is unambiguous.
- **Ask first:** anything that changes behaviour, prompt wording, or what the
  model is told. Take those one at a time and ask about one change, not five.

A clean run says "no findings". Don't invent any.

## Red flags

| Thought                           | Reality                                                                     |
| --------------------------------- | --------------------------------------------------------------------------- |
| "The tests pass"                  | None of this fails a test. It fails a bill, a browser, or a safe word.      |
| "It's only a few tokens"          | Position, not size. One volatile value above the conversation re-bills all. |
| "Nothing on the list covers this" | The list is wants, not checks. Argue from the want.                         |
| "WebKit will probably be fine"    | Playwright's WebKit can't test the paths that most need it. A human must.   |
