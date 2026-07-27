---
name: code-check
description:
  Use before opening a PR and again before merging it, or whenever a branch
  touches how the app talks to the model — checks prompt-cache safety, what
  reaches the model that shouldn't, and what a turn costs. Every turn re-sends
  the whole conversation, so these are money.
---

# Code check

Project-specific review of the LLM path. A companion turn re-sends the entire
conversation, so the bill is decided by two things: what the prompt is made of,
and **where the volatile parts sit**. Get the second wrong and every turn pays
for the whole thread again, silently — nothing fails, it just costs more.

## Scope

- **Default: the branch.** `git diff main...HEAD --name-only`, narrowed to the
  LLM path: `src/lib/companions/**`, `src/lib/llm/**`,
  `src/lib/goonpacks/prompt.ts`, `src/hooks/use-voice-session.ts`,
  `src/app/api/llm/**`, and any persona or pack prompt text.
- **`/code-check all`: sweep** the whole path, not just the diff.
- **Read a real request.** Don't reason from the code alone — log the assembled
  `messages` array for two consecutive turns and diff them. The first position
  where they differ is where the cache breaks, and that is the whole review in
  one number.

## The shape of a request

Assembled in `use-voice-session.ts` (`toLlmMessages(...)` then `liveState(...)`
pushed last):

```
[0]     system     persona prompt — assembled once at load, static forever
[1..n]              the conversation, oldest first
[n+1]   system     TIME / TOY STATUS — rebuilt every turn
```

**The one rule: everything from `[0]` up to the newest turn must be byte-
identical to last turn's request.** Prefix caching matches from position 0 and
stops at the first difference; everything after it is reprocessed and re-billed.

## What to check

1. **Nothing volatile above the conversation.** A timestamp, device state,
   counter, random value or anything else that changes per turn must not reach
   `[0]`. Put one there and the cache breaks at the very top, so every turn
   re-processes the entire thread. `fillSharedSections`
   (`src/lib/goonpacks/prompt.ts`) runs **once at load** and deliberately leaves
   `{{TOY_STATUS}}` and `{{NOW}}` for the per-turn fill instead of resolving
   them — a pack that writes those into its own prompt opts itself out of
   caching entirely, which `use-voice-session.ts` says in place. Flag any new
   per-turn value that lands in an assembled prompt.
2. **Volatile values ride the last message.** `liveStateMessage`
   (`src/lib/companions/shared-prompt.ts`) exists for exactly this. Anything new
   that changes per turn belongs there, not in the prompt — and if it belongs to
   a section that a companion can omit, the prose explaining it does not (see
   `TIME_SECTION`, appended rather than offered as a token).
3. **Nothing is inserted into history.** Gap markers go immediately before the
   _new_ user turn (`src/lib/companions/conversation.ts`), which is the boundary
   where new content starts, so the prefix survives. Anything that rewrites,
   re-orders, summarises or back-fills earlier turns invalidates from that point
   on. Treat "let's tidy up old messages" as a cost change.
4. **What reaches the model.** Display-only fields must not be projected into
   the wire messages — `mediaRef` is display-only and `conversation.ts` says so;
   a tool turn's `name` is dropped on purpose. Every new field on a turn type
   needs an explicit decision, and the default answer is "not sent".
5. **Send only what's needed.** Tools omitted entirely when the list is empty;
   `reasoningDetails` replayed only when the companion's `passesReasoning` is
   set. Both are in `src/lib/llm/client.ts`.
6. **Abort reaches upstream.** The proxy forwards the client's signal
   (`src/app/api/llm/chat/completions/route.ts`). If that stops propagating, a
   barge-in or Stop leaves the model generating into nothing and you pay for
   every token of it. This is the one cost bug with no visible symptom at all.
7. **Can you still see it working?** The client asks for a final usage chunk
   (`stream_options: { include_usage: true }`) but reads only
   `completion_tokens`. Nothing in the app reads prompt tokens or any
   cached-token count, so **cache hit rate is currently unobservable** — which
   means a regression in 1–3 would show up as a bill, not as a symptom. Weigh
   that when judging how carefully a change needs reviewing, and treat "surface
   cached tokens" as the fix that would retire this whole worry.

## Judging a finding

Ask what it costs per turn, not whether it is untidy:

- **Breaks the prefix at `[0]`** — the whole conversation, every turn. Worst
  possible; nothing else is close.
- **Breaks it mid-thread** — everything after that point, every turn. Grows with
  the conversation.
- **Adds tokens to the tail** — pays once per turn for what it adds. Usually
  fine; a few hundred tokens of prose that earns its place is cheap.
- **Sends something it shouldn't** — a correctness and privacy question first, a
  cost question second.

## Output and fixes

Report each finding as
`FILE:LINE — what changes per turn → what it invalidates → what it costs`, worst
first. Then:

- **Fix directly:** moving a volatile value out of an assembled prompt, dropping
  a field that should never have been projected.
- **Ask first:** anything that changes what the model is told — prompt wording,
  section placement, what history it sees. Those change behaviour, not just
  cost, and behaviour is the author's call.

A clean run says "no cache or cost findings" — don't invent findings to seem
useful.

## Red flags

| Thought                                | Reality                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| "It's only a few tokens in the prompt" | Position matters, not size. One volatile token at `[0]` re-bills everything. |
| "The tests pass"                       | Nothing here fails a test. It fails an invoice.                              |
| "Caching is the provider's problem"    | The provider matches a prefix. Whether there is one to match is ours.        |
| "I'll just interpolate the time in"    | That is the exact bug `liveStateMessage` exists to prevent.                  |
| "Tidying old messages is harmless"     | Rewriting history invalidates from the edit to the end, on every later turn. |
| "We'd notice if caching broke"         | We read only completion tokens. We would notice at the end of the month.     |
