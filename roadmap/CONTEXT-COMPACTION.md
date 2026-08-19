# Context compaction — a conversation that outgrows the window

A companion's thread only grows: every turn is appended, nothing but **Clear**
removes one, and the whole of it is re-sent on the next turn. Each companion
records a `contextWindow`, which nothing reads yet — this is the work that would
read it.

`search_media` is what makes the window a real limit rather than headroom for
long sessions. One result is up to `SEARCH_LIMIT` lines of ref, kind and
caption, and it is replayed for the rest of the conversation — which is what
lets a companion send from an earlier search. A thread with a few dozen searches
in it is far bigger than its spoken turns suggest.

How many a search returns is determined by
[Inference library](INFERENCE-LIBRARY.md), not this document.

The model's window is not the first limit the thread reaches. The whole thread
is re-serialised into `localStorage` at every append — the user turn, each tool
round, the reply — and past the origin's quota that write fails. `persistThread`
logs the failure to the Debug tab's Events card and the session carries on from
memory, but every later append fails too, so the next load finds the
conversation rewound to the last version that fit.

To settle:

- which shape does it — summarising older turns, keeping only the most recent
  turns verbatim, or both;
- what happens to the `reasoningDetails` on the assistant turns that go;
- what the exclusion set does when turns go — it is rebuilt from the thread
  ([Inference library](INFERENCE-LIBRARY.md) → The search is thread-scoped), so
  trimming makes a companion re-send what they can no longer see they sent.
