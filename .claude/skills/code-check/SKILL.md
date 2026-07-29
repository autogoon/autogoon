---
name: code-check
description:
  Use before opening a PR and again before merging it. Reviews the branch's
  source against the rules in CLAUDE.md — Architecture and the key handling in
  Secrets / environment — and checks that each comment the diff touched still
  tells the truth about the code beneath it. Not docs, tests, or whether a
  feature should exist.
---

# Code check

Read the code against the rules CLAUDE.md sets for it, and the comments on it
against the code. Where this runs among the checks, and why, is in
[CLAUDE.md](../../../CLAUDE.md) → Git workflow.

**It is about code, not features.** Whether something should exist is a product
question and lives in [TODO.md](../../../TODO.md). This asks whether what does
exist holds up.

**It is not a checklist.** A finding is anything in the branch that breaks one
of those rules — including something no rule names, where the code clearly works
against how the app is built.

## Scope

- **Every branch**, `git diff main...HEAD`.
- **`/code-check all`: full sweep.** The whole codebase rather than the diff,
  and every comment in it rather than the ones a diff touched. Fan out one
  read-only subagent per directory and collect their reports. Expensive; this is
  not the per-PR mode.

## What to check

**Every rule in [CLAUDE.md](../../../CLAUDE.md) → Architecture and → Secrets /
environment → Keys is a check.**

Read them there. They are not repeated here, so a rule added there is checked
without this file changing.

**A comment that no longer describes the code beneath it is a finding here.**
Every comment the diff touched, read against the code it sits on — because this
is the check with that hunk open, and the two can only be judged against each
other by whoever is reading both. Three shapes cost more than no comment at all,
because they are believed:

- a comment describing a branch that has gone;
- a condition inverted since it was written;
- a mechanism that now works another way.

§ Editing files is deliberately not claimed: which tool made an edit leaves no
trace in a diff, and the PreToolUse hook enforces it at the point of use.

Finding a breach is mostly obvious once the rule is in mind — grep for the thing
the rule forbids. The prompt prefix and YAGNI are not, and both are worth the
minutes.

**The prompt prefix.** Assemble two consecutive requests and diff them. The
first index at which they differ is where caching stops; anything below the
newest turn is a finding.

**YAGNI.** The cheap pass first: an export with no caller outside its own module
greps out, and is a real finding. It is not most of them, though — an unexported
field is invisible to that search, and a value can be read, threaded through
three layers and rendered while still serving nothing. So also list what the
branch added that holds or shapes data — a field on a type, an option, a
parameter, a return value — and ask of each what stops working if it is deleted.
Where the answer is "nothing yet", the rule allows one case on a condition; read
the definition site and check it meets it.

## Reporting

`FILE:LINE — what it does → which rule it breaks → what it costs.` Worst first,
and each with evidence: a line, a measurement, or a request you actually
assembled. Reasoning from the code alone is where invented findings come from.

- **Fix directly:** the change is contained and the intent is unambiguous.
- **Ask first:** anything that changes behaviour, prompt wording, or what the
  model is told.

Put those questions **one at a time** — [CLAUDE.md](../../../CLAUDE.md) → Git
workflow.

A clean run says "no findings". Don't invent any.

## Red flags

| Thought                        | Reality                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| "The tests pass"               | None of this fails a test. It costs money, breaks one browser, or loses the safe word. |
| "It's only a few tokens"       | Position, not size. One volatile value above the conversation re-bills all.            |
| "No rule covers this"          | The rules are how the app is built, not a checklist. Argue from them.                  |
| "WebKit will probably be fine" | Playwright's WebKit can't test the paths that most need it. A human must.              |
| "Nothing unused was added"     | Unused is not the test. Ask what breaks without it.                                    |
