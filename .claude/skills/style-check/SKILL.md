---
name: style-check
description:
  Use before opening a PR and again before merging it — reads everything the
  branch added or changed, in documentation and in code comments, against
  CLAUDE.md's writing style. Cuts metaphors, personification, restatement,
  padding, anything that carries nothing, and a register that says everything
  the same way. Checks nothing for truth.
---

# Style check

Read everything the branch wrote against the style CLAUDE.md sets. Nothing here
is settled by looking in another file: text carrying nothing is not false, so
asking whether it is true passes it.

Where this runs among the checks, and why, is in [CLAUDE.md](../../../CLAUDE.md)
→ Git workflow.

## Scope

- **Default: the branch.** Every line the diff added or changed:
  `git diff main...HEAD` over `*.md` at the root, `modes/`, `roadmap/`, `docs/`,
  `.claude/skills/`, and `.env.example`, plus every comment line the diff
  touched in any source file. Read the added and changed lines, not the whole
  file around them — a document the diff never touched is out of scope.
- **`/style-check all`: full sweep.** Every document and every comment in the
  repo. Fan out one read-only subagent per directory and collect their reports.
  Expensive; this is not the per-PR mode.

On the pre-merge pass, the PR's own title and body are in scope too — this repo
wrote them and nothing else reads them for style. Commit messages are inside →
Writing style as well, but rewriting history to fix one costs more than the
flaw: report what you find and leave it.

Text written **during** an earlier check is in scope like any other. So is your
own fix here — a rewrite matches its surroundings, and that is how the register
spreads. Read what you wrote against the shape, not only against the rules.

## The style

**Every rule in [CLAUDE.md](../../../CLAUDE.md) → Writing style is a check.**
Read them there. They are not repeated, so a rule added there is checked without
this file changing.

These belong to other checks, not this one:

- Whether a path resolves.
- Whether an identifier exists.
- Whether a list is complete.
- Whether a claim holds.

Text can be accurate on every one of those and still fail here.

## Three questions

None follows from knowing the rule, and the rules are not enforceable without
them.

**Cut it — the sentence, the clause, the phrase. Did the paragraph lose
anything?** If it says as much without, it goes. This catches:

- a sentence announcing what the next one is about to say;
- a phrase restating the one before it;
- a flourish.

**Ask what a word means here.** Applied to a metaphor or an abstraction: either
it names something the reader can point at, or it stands where a mechanism
should be.

**Name the shape the document is written in, and count it.** The first two
questions run inside a paragraph. A register fault survives both: each instance
carries information, and no single word stands where a mechanism should be. What
fails is that every sentence says its thing the same way. The rule is in
[CLAUDE.md](../../../CLAUDE.md) → Writing style. What this check adds is the
count: mean words per sentence, glosses per line on dashes or a colon, and `so…`
and `which is…` tails. The count is evidence, not a target; without one, "this
reads chatty" is an impression.

Run all three over everything in scope. The third reads the whole of any
document the diff touched, not only the changed lines — the pattern is invisible
in a hunk. It is always **ask first**: the fix rewrites a document, not a line,
and it is one question for that document rather than one per sentence.

## Reporting

`FILE:LINE — quote the words at fault → what they carry → cut or rewrite.` Worst
first.

"Nothing found" is a result only alongside what was read — the files, and
whether the whole of each or only the lines the diff touched. Without that it is
indistinguishable from not having looked.

- **Fix directly:** deletions, and a metaphor whose mechanism the surrounding
  text already states.
- **Ask first:** a rewrite that changes what a passage claims, and any cut that
  would take a fact out with it.

Put those questions **one at a time**, in the four-part form —
[CLAUDE.md](../../../CLAUDE.md) → Git workflow and → Talking to me.

Run `npm run format` after edits.

## Red flags

| Thought                          | Reality                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| "It reads well"                  | Reading well is what padding does. Cut it and read it again.                        |
| "That sentence is true"          | Truth is the other checks'. An empty sentence is not false.                         |
| "The word is obvious in context" | Then the mechanism is easy to write. Write that.                                    |
| "It's only a comment"            | Comments are read while changing the code they sit on.                              |
| "I wrote that an hour ago"       | Then nothing has read it yet. Your own edits are in scope.                          |
| "Every sentence here passes"     | Then read the shape they share. A register fault is fifty sentences that each pass. |
