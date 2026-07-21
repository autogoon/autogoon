# Companions — Phase 5: Conversation thread + persistence

> **Status:** design agreed, not yet implemented. Builds on
> [companions-design.md](./2026-07-18-companions-design.md) (the shared context)
> and the completed Phase 4. This spec covers **Phase 5 only**. Where Phase 5's
> scope diverges from the map in the shared design doc, this spec wins; the
> shared doc is updated to match.

## What Phase 5 is

Give Elise **memory**. Phase 4's turns are stateless — each `submitText` sends a
fresh `[system, user]` pair, so she never remembers what was said a moment ago.
Phase 5 keeps a **rolling conversation thread** (every user + assistant turn)
and passes it back to the LLM on every turn, **persists** it to `localStorage`
so it survives a reload, renders it as a real **chat transcript**, and adds a
**Clear conversation** control.

MiniMax M2 (Elise's model) is a **reasoning model**: it returns a private
thinking block (`reasoning_details` on OpenRouter) alongside the visible reply,
and it was trained with that reasoning present in the history — stripping it
measurably degrades later turns. So Phase 5 also **captures `reasoning_details`
from the stream** (the client currently keeps only content), stores it on each
assistant turn, and **replays it verbatim** in the assistant messages. This is
model-specific, gated by a per-companion **`passesReasoning`** flag (Elise =
`true`).

### Scope decisions (agreed)

- **No context-window culling.** The thread grows unbounded this phase; keeping
  it within the model's `contextWindow` is Phase 9's job. Phase 5 only records
  nothing new — it relies on Phase 4's recorded `contextWindow` being consumed
  later.
- **Interrupted-turn commit rule.** The **user** turn is committed to the thread
  the moment it is submitted; the **assistant** turn is committed only when its
  LLM generation completes (guarded against supersession). A barge-in or Stop
  that lands during TTS playback — the common case — happens _after_ generation
  finished, so the full reply + full `reasoning_details` are already in hand and
  the turn commits normally. A cut _during generation_ commits no assistant
  turn, leaving the user turn dangling (two user turns can then sit
  back-to-back, which the API tolerates). This rule keeps a **truncated
  `reasoning_details` block from ever being replayed to M2**. Whether this feels
  right on hardware is reviewed in **Phase 10**.
- **Clear is a button, instant, no confirm.** Consistent with Phase 4's
  no-vosk-words rule for Companions, Clear has no spoken word. With the
  transcript visible the effect is obvious, so no confirmation dialog.
- **Persistence key is per-companion.** Keyed on the companion
  (`companions:thread:elise`) so a second companion (Phase 12) gets its own
  thread. One companion exists now.

### Explicitly deferred (unchanged from the shared design)

- **Reply-length tuning & the interrupted-turn review → Phase 10.** Phase 5
  ships the commit rule above; whether it (and reply length) feel right on
  hardware is Phase 10.
- **Context compaction → Phase 9.** The unbounded thread is trimmed there; when
  `passesReasoning` is on, old turns' `reasoning_details` are trimmed with the
  messages they belong to.
- **Tools & control → Phase 6**, **proactive speech → Phase 7**, **safeword
  teardown → Phase 8** — all unchanged.

## Design

### 1. A pure conversation module

New `src/lib/companions/conversation.ts` — pure, no React, no I/O — matching the
repo's convention that pure logic is unit-tested (like `session-policy.ts`):

```ts
export type ThreadTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; reasoningDetails?: unknown[] };

export type Thread = ThreadTurn[];

// Immutable builders — return a new thread.
appendUser(thread: Thread, content: string): Thread;
appendAssistant(thread: Thread, content: string, reasoningDetails?: unknown[]): Thread;

// Build the LLM request: the system message first, then every turn. Assistant
// turns carry reasoning_details ONLY when passesReasoning is true.
toLlmMessages(thread: Thread, systemPrompt: string, passesReasoning: boolean): LlmMessage[];

// Persistence codec. parse is tolerant: malformed / partial / legacy JSON → [].
serialize(thread: Thread): string;
parse(raw: string | null): Thread;
```

`reasoningDetails` is stored as `unknown[]` — the client captures OpenRouter's
opaque detail objects and we replay them unmodified; the module never inspects
their shape. `toLlmMessages` is where the `passesReasoning` gate lives, so a
non-reasoning companion simply never emits the field.

### 2. LLM client — capture & replay reasoning

`LlmMessage` gains an optional assistant-only field:

```ts
export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  reasoningDetails?: unknown[]; // assistant turns only; mapped to reasoning_details
};
```

`client.ts` changes:

- **Send side.** When building the outgoing `messages`, map each message's
  `reasoningDetails` to OpenRouter's `reasoning_details` field. The `openai`
  SDK's message type doesn't include it, so this is a narrow cast at the
  boundary (a local augmented type, not an `any` on the whole call).
- **Read side.** The stream already yields `delta.content`. Add capture of
  `chunk.choices[0].delta.reasoning_details` (also via a local augmented delta
  type). Accumulate the streamed detail entries into one ordered array (merge
  entries sharing an `index`, appending their `text`), and surface the assembled
  array once at end via a new callback:

  ```ts
  opts: { signal; onUsage?; onReasoning?: (details: unknown[]) => void }
  ```

  mirroring how `onUsage` reports token accounting. The client stays
  **model-agnostic**: it always surfaces reasoning when the backend sends it;
  the _caller_ decides whether to store/replay it (via the companion's flag).

> **Reassembly is provider-specific.** How M2's `:nitro` route chunks
> `reasoning_details` (growing text per index vs. whole blocks) is verified
> against live output during bring-up; the "merge by index, append text" rule is
> the starting point and adjusted if the live stream shows otherwise.

### 3. Companion config — `passesReasoning`

`src/lib/companions/companions.ts` — the `Companion` type gains:

```ts
passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
```

Elise = `true`. A future non-reasoning companion sets `false`.

### 4. Wiring in `use-voice-session.ts`

The thread is live session state:

- A **`threadRef`** (`Thread`) is the source of truth, read/written inside the
  once-created callbacks (like the other live refs). It is **mirrored into
  `VoiceStatus.thread`** so the panel can render the transcript.
- **On mount** (session hook init): `parse(localStorage.getItem(key))` seeds
  `threadRef` and the mirrored state, so a reload restores the conversation.
- **On submit** (`submitText`): after the empty-prompt / clients guards,
  `appendUser` the prompt (ref + state + persist), then build the request with
  `toLlmMessages(threadRef.current, ELISE.systemPrompt, ELISE.passesReasoning)`
  — replacing today's inline `[system, user]`.
- **During the stream:** capture reasoning via `onReasoning` into a local; the
  visible reply still streams into `status.replyText` token-by-token.
- **On generation-complete** (the existing guarded metrics-record point, before
  TTS): `appendAssistant(content, passesReasoning ? reasoning : undefined)`
  (ref + state + persist). Because this is the same guard the metrics use, a
  superseded/aborted-mid-generation turn commits **no** assistant turn.
- **`clearThread()`**: empties `threadRef`, clears the mirrored state, and
  removes the `localStorage` key. Exposed on the `VoiceSession` return.
- **`stop()`** does **not** clear the thread — the conversation persists across
  a Stop-listening and only Clear (or a new session's fresh load) resets it.

Persistence is **write-through** on each mutation (user append, assistant
append, clear). `localStorage.getItem/setItem` calls live in the hook (thin,
integration — untested); the `serialize`/`parse` codec they call is pure and
unit-tested.

`VoiceStatus` gains `thread: ThreadTurn[]`; `IDLE_STATUS.thread = []`. Note
`stop()` resets status to `IDLE_STATUS` but leaves `threadRef` intact, so the
mirror is re-seeded from the ref on the next render path — the panel reads
`threadRef`'s content via the status mirror kept in sync on every mutation.

### 5. Conversation UI — iMessage-style transcript

The **Conversation** card renders `status.thread` as a chat transcript: user
turns as right-aligned accent bubbles, Elise's as left-aligned muted bubbles.
While a reply is generating, an in-progress Elise bubble shows the live
`status.replyText` (the existing "Thinking…" spinner covers the pre-first-token
gap); on completion it folds into the thread as the last assistant turn. The
composer (textarea + **Send** / **Say it** / **Stop**) stays; a **Clear
conversation** button sits with it, disabled while a reply is in flight.
`status.replyError` still surfaces inline. The bubble styling is built with the
frontend-design skill.

### 6. Doc updates

- Shared design doc's Phase 5 entry already describes this phase; the phase map
  is updated for the new **Phase 10** (turn-commit review + reply-length
  tuning + Elise prompt polish), **Phase 11** (persona shapes Elise's program),
  and **Phase 12** (contrasting second companion), with reply-length tuning
  removed from Phase 8 and the persona model reworked to the four `traits`.
- `COMPANIONS.md` gains a short note that Elise carries `passesReasoning: true`
  and that the conversation persists in `localStorage` (Clear to reset).

## Testing

- **`conversation.test.ts` (new, unit).** `appendUser` / `appendAssistant`
  immutability; `toLlmMessages` puts system first and emits `reasoning_details`
  only when `passesReasoning`; `serialize`→`parse` round-trips; `parse`
  tolerates `null` / malformed / partial JSON → `[]`.
- **`client.test.ts` (update).** `onReasoning` fires once with the assembled
  array from streamed `reasoning_details` deltas; outgoing assistant messages
  carry `reasoning_details` when the input message has `reasoningDetails`;
  content-only streams still work and never fire `onReasoning`.
- **Typecheck / lint / build** stay green (zero-warning repo).
- **Manual bring-up** (the real gate): talk to Elise, then reference something
  said earlier and confirm she recalls it; reload the page and confirm the
  thread is restored and she still remembers; press **Clear** and confirm the
  transcript and memory are wiped; barge-in mid-playback and confirm the
  completed turn is in the thread; barge-in mid-generation and confirm no
  partial assistant turn is stored. With M2, confirm multi-turn coherence is
  noticeably better than Phase 4's stateless turns.

## Open items / notes

- **Reasoning reassembly** against live M2 `:nitro` output — confirm the chunk
  shape and adjust the merge rule if needed (see §2).
- **Dangling user turns** from mid-generation cuts are accepted this phase; the
  interrupted-turn rule is reviewed on hardware in Phase 10.
- **Unbounded growth** is intentional; Phase 9 adds compaction before long
  sessions can overflow M2's window.
