An automated sweep pass has edited one documentation file; that pass's diff is
appended to this prompt. Judge the edit, not the file's remaining faults — other
passes own those. Read the file itself with Read where a hunk alone cannot be
judged.

Two questions:

1. Does any added or rewritten sentence break CLAUDE.md → Writing style —
   personification, coined metaphor, padding, restatement, a
   claim–gloss–consequence tail?
2. Does any removal lose a fact, a condition, an exception or a reason the file
   carried before?

`ok` is true only when both answers are no. Each entry in `reasons` quotes the
offending hunk text and says which question it fails and why. Do not fail the
diff for faults it did not introduce.
