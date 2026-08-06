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
question and lives in [TODO.md](../../../TODO.md).

**It is not a checklist.** A finding is anything in the branch that breaks one
of those rules — including something no rule names, where the code clearly works
against how the app is built.

## Scope

- **Default: the branch.** `git diff main...HEAD`.
- **`/code-check all`: full sweep.** The whole codebase rather than the diff,
  and every comment in it rather than the ones a diff touched. Fan out one
  read-only subagent per top-level directory under `src/` and `scripts/`, and
  collect their reports. Expensive; this is not the per-PR mode.

## What to check

**Every rule in [CLAUDE.md](../../../CLAUDE.md) → Architecture and → Secrets /
environment → Keys is a check.**

Read them there. They are not repeated here, so a rule added there is checked
without this file changing.

**A comment that no longer describes the code beneath it is a finding here.**
Every comment the diff touched, read against the code it sits on — because this
is the check with that hunk open. Three shapes cost more than no comment at all,
because they are believed:

- a comment describing a branch that has gone;
- a condition inverted since it was written;
- a mechanism that now works another way.

→ Editing files is half in scope. Which tool made an edit leaves no trace in a
diff, so nothing here reads for it. Its control-character rule does leave one,
and this is the check that reads for it: run

    perl -ne 'print "$ARGV:$.\n" if /[\x00-\x08\x0b\x0c\x0e-\x1f]/' $(git diff main...HEAD --name-only --diff-filter=d)

over the branch. A hit is a finding wherever it lands.

Finding a breach is mostly obvious once the rule is in mind — grep for the thing
the rule forbids. The prompt prefix, YAGNI and the safe word are not, and each
is worth the minutes.

**The prompt prefix.** Two consecutive requests are assembled in
`src/hooks/use-voice-session.ts`, where the conversation is turned into messages
and the live-state message pushed after it. Reconstruct both and diff them. The
first index at which they differ is where caching stops: it must be the newest
turn or the trailing live-state message. Anything earlier is a finding.

**YAGNI.** The cheap pass first: an export with no caller outside its own module
greps out, and is a real finding. It is not most of them, though — an unexported
field is invisible to that search, and a value can be read, threaded through
three layers and rendered while still serving nothing. So also list what the
branch added that holds or shapes data — a field on a type, an option, a
parameter, a return value — and ask of each what stops working if it is deleted.
Where the answer is "nothing yet", → Architecture's YAGNI rule allows one case
on a condition. Read the definition site and check that case meets that
condition.

**The safe word.** A breach is an absence, so no grep reaches it. One condition
puts the word in the grammar — `src/app/page.tsx`, the global grammar slot. List
the states the branch adds or changes, along with any change to the recognizer's
lifetime or to a screen transition, and for each say what keeps the word in the
grammar there. A state you cannot answer for is a finding.

**Keys.** `NEXT_PUBLIC_` greps out. The other half of the rule does not: a
`process.env` read is only safe where its module cannot reach the browser
bundle. For each one the branch added, follow the imports out to a route handler
or to a `'use client'` component, and say which it reached.

## Reporting

`FILE:LINE — what it does → which rule it breaks → what it costs.` Worst first,
and each with evidence: a line, a measurement, or a request you actually
assembled. Reasoning about what the code would do, without running it or
assembling the request, is where invented findings come from.

- **Fix directly:** a breach with one correct repair — a cross-engine import, a
  browser branch with no comment naming the engine, a comment describing code
  that has gone.
- **Ask first:** anything that changes behaviour, prompt wording, or what the
  model is told.

After any edit, run the gates — [CLAUDE.md](../../../CLAUDE.md) → Verifying
changes. This is the check that edits source, so its own fix can fail one.

Put those questions **one at a time**, in the four-part form —
[CLAUDE.md](../../../CLAUDE.md) → Git workflow and → Talking to me.

A clean run says "no findings". Don't invent any.

## Red flags

| Thought                        | Reality                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| "The tests pass"               | None of this fails a test. It costs money, breaks one browser, or loses the safe word. |
| "It's only a few tokens"       | Size is not the mechanism. → Architecture, "The prompt prefix stays reusable".         |
| "WebKit will probably be fine" | Green in Playwright is not coverage. → Architecture, "One path for every browser".     |
