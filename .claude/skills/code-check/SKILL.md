---
name: code-check
description:
  Use before opening a PR and again before merging it. Reviews the branch's
  source against the rules in CLAUDE.md — Architecture, the key handling in
  Secrets / environment, and Documentation's precision rule read against the
  code. Code only — not comments, docs, tests, or whether a feature should
  exist.
---

# Code check

`/doc-check` reads the docs, `/test-check` reads the tests, `/personal-check`
reads for leaks. This one reads the code against the rules CLAUDE.md sets for
it.

**It is about code, not features.** Whether something should exist is a product
question and lives in [TODO.md](../../../TODO.md). This asks whether what does
exist holds up.

**It is not a checklist.** A finding is anything in the branch that breaks one
of those rules — including something no rule names, where the code clearly works
against how the app is built.

## Scope

- **Every branch**, `git diff main...HEAD`. A check applied only when someone
  judges it relevant is a check that never runs; where a branch went near none
  of this, "no findings" costs a minute.
- **`/code-check all`** reads the whole codebase rather than the diff.

## What to check

**Every rule in [CLAUDE.md](../../../CLAUDE.md) → Architecture and → Secrets /
environment → Keys is a check**, and so is → Documentation's precision rule read
against the code itself: a wrapper that carries no information, a type or layer
naming an abstraction with no referent, a construction that is approximately
right where the exact one costs nothing. The other half of Secrets /
environment, → What must never be committed, is `/personal-check`'s.

Read them there. They are not repeated here, so a rule added there is checked
without this file changing, and there is no second copy to go stale.

§ Editing files is deliberately not claimed: which tool made an edit leaves no
trace in a diff, and the PreToolUse hook enforces it at the point of use.

§ Comments are not claimed either, precision included: `/doc-check` takes every
comment the diff touched, and reads it against the whole of → Documentation.

Finding a breach is mostly obvious once the rule is in mind — grep for the thing
the rule forbids. One technique is not obvious, and is worth the minutes: to
check the prompt prefix, assemble two consecutive requests and diff them. The
first index at which they differ is where caching stops; anything below the
newest turn is a finding.

## Reporting

`FILE:LINE — what it does → which rule it breaks → what it costs.` Worst first,
and each with evidence: a line, a measurement, or a request you actually
assembled. Reasoning from the code alone is where invented findings come from.

- **Fix directly:** the change is contained and the intent is unambiguous.
- **Ask first:** anything that changes behaviour, prompt wording, or what the
  model is told. Take those one at a time and ask about one change, not five.

A clean run says "no findings". Don't invent any.

## Red flags

| Thought                        | Reality                                                                     |
| ------------------------------ | --------------------------------------------------------------------------- |
| "The tests pass"               | None of this fails a test. It fails a bill, a browser, or a safe word.      |
| "It's only a few tokens"       | Position, not size. One volatile value above the conversation re-bills all. |
| "No rule covers this"          | The rules are how the app is built, not a checklist. Argue from them.       |
| "WebKit will probably be fine" | Playwright's WebKit can't test the paths that most need it. A human must.   |
