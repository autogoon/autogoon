# BUG

Known defects in behaviour that is already implemented. Severity decides when
one gets fixed, not whether it belongs here. The divide against the other files
is in [CLAUDE.md → Documentation](./CLAUDE.md#documentation).

## Companions

- **An exhausted media set reads as "nothing matches".** Once everything
  matching a request has been sent, the exclusion set covers it all and
  `searchMedia` returns nothing. The companion is told "Nothing in your pictures
  or videos matches that", which is false, and the prompt then has them ask him
  for something else.

  The exclusion is thread-scoped, not session-scoped. It is rebuilt from the
  thread, which persists per companion and is never trimmed, so it only grows.
  Clearing the thread is the one thing that resets it. Exhaustion is where any
  pack ends up, not an edge case for a small one.

  The retrieval work this waits on is
  [roadmap/INFERENCE-LIBRARY.md](./roadmap/INFERENCE-LIBRARY.md) → The search is
  thread-scoped.

  How often a companion should repeat a picture unprompted is the open question.
  **Sending is deliberately unfiltered**: `pickMedia` sends any ref it is given,
  already sent or not, because "send me my favourite picture of you" has to
  work.
