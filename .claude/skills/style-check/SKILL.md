---
name: style-check
description:
  Use before opening a PR and again before merging it — reads every sentence the
  branch added or changed, in documentation and in code comments, against
  CLAUDE.md's writing style. Cuts metaphors, personification, restatement,
  padding and sentences that carry nothing. Checks nothing for truth.
---

# Style check

Read every sentence the branch wrote against the style CLAUDE.md sets. Nothing
here is settled by looking in another file: a sentence carrying nothing is not
false, so asking whether it is true passes it.

Where this runs among the checks, and why, is in [CLAUDE.md](../../../CLAUDE.md)
→ Git workflow.

## Scope

- **Default: the branch.** Every sentence the diff added or changed:
  `git diff main...HEAD` over `*.md` at the root, `modes/`, `roadmap/`, `docs/`,
  `.claude/skills/`, and `.env.example`, plus every comment line the diff
  touched in any source file. Read the added and changed lines, not the whole
  file around them — a document the branch never opened is out of scope.
- **`/style-check all`: full sweep.** Every document and every comment in the
  repo. Fan out one read-only subagent per directory and collect their reports.
  Expensive; this is not the per-PR mode.

Text written **during** an earlier check is in scope like any other. The checks
that run before this one all write new sentences while fixing what they find,
and nothing else reads those.

## The style

**Every rule in [CLAUDE.md](../../../CLAUDE.md) → Writing style is a check.**
Read them there. They are not repeated, so a rule added there is checked without
this file changing.

Whether a path resolves, an identifier exists, a list is complete or a claim
holds are other checks' subjects. A sentence can be accurate and still fail
here.

## Two questions

Neither follows from knowing the rule, and the rule is not enforceable without
them.

**Cut the sentence. Did the paragraph lose anything?** Delete it and read the
paragraph. If it says as much without, the sentence goes. This catches a
sentence announcing what the next one is about to say, a phrase restating the
one before it, and a flourish.

**Ask what a word means here.** Applied to a metaphor or an abstraction: either
it names something the reader can point at, or it stands where a mechanism
should be. A metaphor that has become the term for something — backpressure, a
hot path — is read rather than decoded and stays. One coined for the sentence
goes, and the mechanism it stood in for gets written instead.

Run both over every sentence in scope.

## Reporting

`FILE:LINE — the sentence → what it carries → cut or rewrite.` Worst first.
There is no column for what the code says, because no finding here is about the
code.

End with the count: sentences read, sentences cut. "Nothing found" is a result
only alongside those two numbers — without them it is indistinguishable from not
having looked.

- **Fix directly:** deletions, and a metaphor whose mechanism the surrounding
  text already states.
- **Ask first:** a rewrite that changes what a passage claims, and any cut that
  would take a fact out with it.

Put those questions **one at a time** — [CLAUDE.md](../../../CLAUDE.md) → Git
workflow.

Run `npm run format` after edits.

## Red flags

| Thought                          | Reality                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| "It reads well"                  | Reading well is what padding does. Cut it and read it again. |
| "That sentence is true"          | Truth is the other checks'. An empty sentence is not false.  |
| "The word is obvious in context" | Then the mechanism is shorter. Write that.                   |
| "It's only a comment"            | Comments are read while changing the code they sit on.       |
| "I wrote that an hour ago"       | Then nothing has read it yet. Your own edits are in scope.   |
