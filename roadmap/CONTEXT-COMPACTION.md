# Context compaction — a conversation that outgrows the window

A companion's thread only grows. Every turn is appended and the whole of it is
re-sent on the next one. `contextWindow` is recorded per companion for this, and
nothing reads it yet.

`search_media` is what makes it a real limit rather than headroom for long
sessions. Its result is the largest thing a turn can hold, up to `SEARCH_LIMIT`
lines of ref and caption, and it is replayed for the rest of the conversation.
That replay is what lets a companion send from an earlier search. A thread with
a few dozen searches in it is far bigger than its spoken turns suggest.

The model's window is not the first limit it reaches. The whole thread is
re-serialised into `localStorage` on every turn, and past the origin's quota
that write fails. `persistThread` logs the failure to the Companions event log,
but nothing recovers the turn, so the conversation rewinds to the last version
that fit on the next load.

To settle:

- which shape does it — summarising older turns, keeping a rolling window of
  recent turns verbatim, or both;
- what happens to the `reasoning_details` belonging to the messages that go.
