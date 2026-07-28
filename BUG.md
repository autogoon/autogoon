# BUG

Known-wrong behaviour with no settled approach. A defect worth fixing now is
fixed now rather than written down; what lands here is what can't be, usually
because the fix waits on work that hasn't happened.

The split against the other files: [TODO.md](./TODO.md) is work that is ready to
pick up — including "run the experiment and see", where the task is defined even
though the answer isn't. [ROADMAP.md](./ROADMAP.md) and `roadmap/*.md` are
direction, where nothing is wrong and it could be more. Here, something is wrong
and the approach isn't known. An entry moves to TODO.md the moment it is.

## Companions

- **An exhausted media set reads as "nothing matches".** Once everything
  matching a request has been sent, the exclusion set covers it all,
  `searchMedia` returns nothing, and the companion is told "Nothing in your
  pictures or videos matches that" — which is false, and the prompt then has
  them ask him for something else. The exclusion is not session-scoped, either:
  it is rebuilt from the thread, the thread persists per companion and is never
  trimmed, so the set only grows and clearing the thread is the one thing that
  resets it. Exhaustion is therefore where any pack ends up, not an edge case
  for a small one.

  A candidate, not a decision: rank a sent picture down rather than removing it,
  so a set with nothing new returns its best old match instead of a falsehood.
  That is one of the four levers weighed in
  [roadmap/INFERENCE-LIBRARY.md](./roadmap/INFERENCE-LIBRARY.md) → The search is
  session-scoped, and which of them earns its place is deferred to a real
  library — so the shape of the fix arrives with that work.

  The question underneath it is how often a companion should repeat a picture
  unprompted, which is a search-ranking question rather than a rule about
  sending. **Sending is deliberately unfiltered**: `pickMedia` sends any ref it
  is given, already sent or not, because "send me my favourite picture of you"
  has to work. The asymmetry is the design — what she reaches for on her own
  avoids repeats, what he asks for by name does not.
