# Companions Phase 5 — Conversation Thread + Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the companion Elise memory — a rolling conversation thread that
is replayed to the LLM each turn (with M2's reasoning blocks preserved),
persisted to `localStorage`, rendered as a chat transcript, and resettable via a
Clear button.

**Architecture:** A new pure `conversation.ts` module owns the thread data type
and its immutable builders, LLM-message projection, and a tolerant persistence
codec (unit-tested, like `session-policy.ts`). The LLM `client.ts` gains
model-agnostic capture/replay of OpenRouter `reasoning_details`.
`use-voice-session.ts` holds the live thread in a `threadRef`,
write-through-persists it on every mutation, mirrors it into
`VoiceStatus.thread`, and exposes `clearThread()`. The panel renders the mirror
as iMessage-style bubbles with an in-progress assistant bubble and a Clear
button.

**Tech Stack:** TypeScript, React (client hooks), Next.js, the `openai` SDK
(streaming, pointed at the same-origin `/api/llm` proxy), Jest
(`@jest/globals`), Tailwind.

## Global Constraints

- **Zero-warning repo.** `npm run lint` runs with `--max-warnings 0` and
  `npm run typecheck` must be silent. Fix every warning/error before finishing a
  task, including ones your change didn't cause. No `any`; use narrow local
  augmented types + casts at the SDK boundary.
- **Prettier is the formatter.** Run `npm run format` before a task is done;
  commit any files it changes as part of the work.
- **Engines/pure logic are self-contained and unit-tested.** Pure modules
  (`conversation.ts`) get colocated `*.test.ts` importing from `@jest/globals`,
  node environment. Integration wiring (the hook) and UI are **not** unit-tested
  — they are gated by typecheck/build + manually driving the app.
- **Companions register no vosk words.** Every new control (Clear) is
  button-only; do not add spoken words.
- **Persistence key is per-companion:** `companions:thread:elise`, derived as
  `` `companions:thread:${ELISE.name.toLowerCase()}` ``.
- **`reasoningDetails` is opaque `unknown[]`.** The conversation module never
  inspects its shape; the client only merges streamed entries by `index` and
  appends `text`. Reassembly is provider-specific and confirmed against live M2
  `:nitro` output during bring-up.
- **No per-phase changelog.** `CHANGELOG.md` is updated only when the feature
  ships (merges to `main`), not per implementation phase — Phase 5 adds no
  changelog entry.

---

## File Structure

- **Create** `src/lib/companions/conversation.ts` — pure thread type, immutable
  builders, `toLlmMessages`, `serialize`/`parse`. No React, no I/O.
- **Create** `src/lib/companions/conversation.test.ts` — unit tests for the
  above.
- **Modify** `src/lib/llm/client.ts` — `LlmMessage.reasoningDetails`, send-side
  mapping to `reasoning_details`, read-side capture + `onReasoning` callback.
- **Modify** `src/lib/llm/client.test.ts` — reasoning capture/replay tests.
- **Modify** `src/lib/companions/companions.ts` — `Companion.passesReasoning`;
  `ELISE.passesReasoning = true`.
- **Modify** `src/lib/companions/companions.test.ts` — assert Elise's flag.
- **Modify** `src/hooks/use-voice-session.ts` — thread ref, seed/persist/clear,
  `VoiceStatus.thread`, `clearThread` on the return, thread-aware request build.
- **Modify** `src/components/algorithms/companions-panel.tsx` — transcript
  bubbles + Clear button, replacing the flat "Response" preview.
- **Modify** `COMPANIONS.md` — note `passesReasoning: true` and `localStorage`
  persistence; update the `Companion` type snippet.

---

## Task 1: Pure conversation module

**Files:**

- Create: `src/lib/companions/conversation.ts`
- Test: `src/lib/companions/conversation.test.ts`

**Interfaces:**

- Consumes: `LlmMessage` (existing) from `@/lib/llm/client`. After Task 2,
  `LlmMessage` has an optional `reasoningDetails?: unknown[]`; this task only
  needs the base shape, so it can be built before or after Task 2.
- Produces (relied on by Tasks 4 & 5):
  - `type ThreadTurn = { role: "user"; content: string } | { role: "assistant"; content: string; reasoningDetails?: unknown[] }`
  - `type Thread = ThreadTurn[]`
  - `appendUser(thread: Thread, content: string): Thread`
  - `appendAssistant(thread: Thread, content: string, reasoningDetails?: unknown[]): Thread`
  - `toLlmMessages(thread: Thread, systemPrompt: string, passesReasoning: boolean): LlmMessage[]`
  - `serialize(thread: Thread): string`
  - `parse(raw: string | null): Thread`

- [ ] **Step 1: Write the failing test**

Create `src/lib/companions/conversation.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import {
  appendUser,
  appendAssistant,
  toLlmMessages,
  serialize,
  parse,
  type Thread,
} from "./conversation";

describe("conversation thread builders", () => {
  it("appendUser returns a new thread and does not mutate the input", () => {
    const before: Thread = [];
    const after = appendUser(before, "hello");
    expect(before).toEqual([]);
    expect(after).toEqual([{ role: "user", content: "hello" }]);
  });

  it("appendAssistant stores reasoningDetails only when provided", () => {
    const withReasoning = appendAssistant([], "hi", [{ index: 0, text: "t" }]);
    expect(withReasoning).toEqual([
      {
        role: "assistant",
        content: "hi",
        reasoningDetails: [{ index: 0, text: "t" }],
      },
    ]);
    const without = appendAssistant([], "hi");
    expect(without).toEqual([{ role: "assistant", content: "hi" }]);
    expect("reasoningDetails" in without[0]).toBe(false);
  });
});

describe("toLlmMessages", () => {
  const thread: Thread = [
    { role: "user", content: "hey" },
    {
      role: "assistant",
      content: "hi",
      reasoningDetails: [{ index: 0, text: "r" }],
    },
    { role: "user", content: "again" },
  ];

  it("puts the system message first, then every turn in order", () => {
    const msgs = toLlmMessages(thread, "SYS", false);
    expect(msgs[0]).toEqual({ role: "system", content: "SYS" });
    expect(msgs.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
  });

  it("emits reasoning_details on assistant turns only when passesReasoning", () => {
    const on = toLlmMessages(thread, "SYS", true);
    expect(on[2]).toEqual({
      role: "assistant",
      content: "hi",
      reasoningDetails: [{ index: 0, text: "r" }],
    });
    const off = toLlmMessages(thread, "SYS", false);
    expect(off[2]).toEqual({ role: "assistant", content: "hi" });
    expect("reasoningDetails" in off[2]).toBe(false);
  });

  it("never emits reasoningDetails for assistant turns that carry none", () => {
    const t: Thread = [{ role: "assistant", content: "hi" }];
    expect(toLlmMessages(t, "SYS", true)[1]).toEqual({
      role: "assistant",
      content: "hi",
    });
  });
});

describe("serialize / parse", () => {
  it("round-trips a thread", () => {
    const thread: Thread = [
      { role: "user", content: "a" },
      {
        role: "assistant",
        content: "b",
        reasoningDetails: [{ index: 0, text: "x" }],
      },
    ];
    expect(parse(serialize(thread))).toEqual(thread);
  });

  it("returns [] for null, malformed, non-array, and partial/legacy shapes", () => {
    expect(parse(null)).toEqual([]);
    expect(parse("not json")).toEqual([]);
    expect(parse("{}")).toEqual([]);
    expect(parse('{"role":"user"}')).toEqual([]);
    expect(parse('[{"role":"user"}]')).toEqual([]); // missing content
    expect(parse('[{"role":"bot","content":"x"}]')).toEqual([]); // bad role
    expect(
      parse('[{"role":"assistant","content":"x","reasoningDetails":"nope"}]'),
    ).toEqual([]); // reasoning not an array
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/companions/conversation.test.ts` Expected: FAIL —
`Cannot find module './conversation'`.

- [ ] **Step 3: Write the module**

Create `src/lib/companions/conversation.ts`:

```ts
// The companion conversation thread: a pure, immutable record of every user and
// assistant turn, plus the projection to the LLM request and the localStorage
// codec. No React, no I/O — the hook owns the live ref and the storage calls;
// this module is the tested logic they lean on (like session-policy.ts).
import type { LlmMessage } from "@/lib/llm/client";

export type ThreadTurn =
  | { role: "user"; content: string }
  // reasoningDetails holds OpenRouter's opaque reasoning_details, captured from
  // the stream and replayed verbatim; we never inspect its shape.
  | { role: "assistant"; content: string; reasoningDetails?: unknown[] };

export type Thread = ThreadTurn[];

// Immutable builders — return a new thread, never mutate the input.
export function appendUser(thread: Thread, content: string): Thread {
  return [...thread, { role: "user", content }];
}

export function appendAssistant(
  thread: Thread,
  content: string,
  reasoningDetails?: unknown[],
): Thread {
  const turn: ThreadTurn =
    reasoningDetails === undefined
      ? { role: "assistant", content }
      : { role: "assistant", content, reasoningDetails };
  return [...thread, turn];
}

// Build the LLM request: the system message first, then every turn. Assistant
// turns carry reasoning_details ONLY when passesReasoning is true (reasoning
// models); a non-reasoning companion never emits the field.
export function toLlmMessages(
  thread: Thread,
  systemPrompt: string,
  passesReasoning: boolean,
): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: "system", content: systemPrompt }];
  for (const turn of thread) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else if (passesReasoning && turn.reasoningDetails !== undefined) {
      messages.push({
        role: "assistant",
        content: turn.content,
        reasoningDetails: turn.reasoningDetails,
      });
    } else {
      messages.push({ role: "assistant", content: turn.content });
    }
  }
  return messages;
}

export function serialize(thread: Thread): string {
  return JSON.stringify(thread);
}

// Tolerant codec: any malformed / partial / legacy / non-array JSON → [], so a
// bad or stale localStorage value can never crash the session — it just starts
// fresh.
export function parse(raw: string | null): Thread {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Thread = [];
  for (const item of data) {
    if (item === null || typeof item !== "object") return [];
    const turn = item as Record<string, unknown>;
    if (typeof turn.content !== "string") return [];
    if (turn.role === "user") {
      out.push({ role: "user", content: turn.content });
    } else if (turn.role === "assistant") {
      if (turn.reasoningDetails === undefined) {
        out.push({ role: "assistant", content: turn.content });
      } else if (Array.isArray(turn.reasoningDetails)) {
        out.push({
          role: "assistant",
          content: turn.content,
          reasoningDetails: turn.reasoningDetails,
        });
      } else {
        return [];
      }
    } else {
      return [];
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/companions/conversation.test.ts` Expected: PASS (all
assertions green).

- [ ] **Step 5: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run format` Expected: silent
typecheck, zero lint warnings; commit any files `format` touched.

```bash
git add src/lib/companions/conversation.ts src/lib/companions/conversation.test.ts
git commit -m "Companions: pure conversation-thread module (builders, LLM projection, codec)"
```

---

## Task 2: LLM client — capture & replay reasoning

**Files:**

- Modify: `src/lib/llm/client.ts:8-11` (`LlmMessage` type), `:19-22` (`stream`
  opts type), `:39-62` (`stream` impl)
- Test: `src/lib/llm/client.test.ts`

**Interfaces:**

- Consumes: existing `openai` SDK types
  (`OpenAI.Chat.Completions.ChatCompletionMessageParam`).
- Produces (relied on by Tasks 1 & 4):
  - `LlmMessage` gains `reasoningDetails?: unknown[]` (assistant turns only).
  - `stream`'s `opts` gains `onReasoning?: (details: unknown[]) => void`, fired
    **once at end** with the assembled reasoning array, only when the backend
    sent `reasoning_details`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/llm/client.test.ts`. First, replace the top-of-file `Chunk` type
and `fakeStream` helper so chunks can also carry `reasoning_details`, and add
helpers/tests:

Replace lines 3–13 (the `Chunk` type + `createMock`) with:

```ts
type ReasoningDelta = { index: number; type?: string; text?: string };
type Chunk = {
  choices: {
    delta: { content?: string; reasoning_details?: ReasoningDelta[] };
  }[];
};
const createMock =
  jest.fn<(...args: unknown[]) => Promise<AsyncIterable<Chunk>>>();
```

Then add a reasoning stream helper next to `fakeStream`:

```ts
// A fake stream whose chunks carry only reasoning_details deltas (and one final
// content chunk), for exercising the reasoning capture path.
function fakeReasoningStream(
  chunks: Chunk["choices"][0]["delta"][],
): AsyncIterable<Chunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of chunks) yield { choices: [{ delta }] };
    },
  };
}
```

Then add these tests inside `describe("createLlmClient", ...)`:

```ts
it("fires onReasoning once with reasoning_details merged by index", async () => {
  createMock.mockResolvedValue(
    fakeReasoningStream([
      {
        reasoning_details: [
          { index: 0, type: "reasoning.text", text: "Let me" },
        ],
      },
      { reasoning_details: [{ index: 0, text: " think" }] },
      { content: "Answer" },
    ]),
  );
  const { createLlmClient } = await import("./client");
  const client = createLlmClient("test-model");
  const seen: unknown[][] = [];
  const tokens = await collect(
    client.stream([{ role: "user", content: "hi" }], {
      signal: new AbortController().signal,
      onReasoning: (d) => seen.push(d),
    }),
  );
  expect(tokens).toEqual(["Answer"]);
  expect(seen).toHaveLength(1);
  expect(seen[0]).toEqual([
    { index: 0, type: "reasoning.text", text: "Let me think" },
  ]);
});

it("never fires onReasoning for a content-only stream", async () => {
  createMock.mockResolvedValue(fakeStream(["Hi", " there"]));
  const { createLlmClient } = await import("./client");
  const client = createLlmClient("test-model");
  const onReasoning = jest.fn();
  await collect(
    client.stream([{ role: "user", content: "hi" }], {
      signal: new AbortController().signal,
      onReasoning,
    }),
  );
  expect(onReasoning).not.toHaveBeenCalled();
});

it("maps a message's reasoningDetails to reasoning_details on the wire", async () => {
  createMock.mockResolvedValue(fakeStream(["ok"]));
  const { createLlmClient } = await import("./client");
  const client = createLlmClient("test-model");
  await collect(
    client.stream(
      [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "prev",
          reasoningDetails: [{ index: 0, text: "x" }],
        },
      ],
      { signal: new AbortController().signal },
    ),
  );
  const [params] = createMock.mock.calls[0] as [{ messages: unknown[] }];
  expect(params.messages).toEqual([
    { role: "user", content: "hi" },
    {
      role: "assistant",
      content: "prev",
      reasoning_details: [{ index: 0, text: "x" }],
    },
  ]);
});
```

Also update `fakeStream`'s existing signature comment/type only if lint
complains — its `content`-only shape is still assignable to the widened `Chunk`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/llm/client.test.ts` Expected: FAIL — `onReasoning`
unknown in opts type / outgoing messages lack `reasoning_details`.

- [ ] **Step 3: Implement the client changes**

In `src/lib/llm/client.ts`, replace the `LlmMessage` type (lines 8–11):

```ts
export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  reasoningDetails?: unknown[]; // assistant turns only; mapped to reasoning_details
};
```

Replace the `stream` field type in `LlmClient` (lines 19–22) and the impl's
`opts` param (line 41) so both read:

```ts
opts: {
  signal: AbortSignal;
  onUsage?: (usage: LlmUsage) => void;
  onReasoning?: (details: unknown[]) => void;
},
```

Add these local augmented types just below the imports (after line 6):

```ts
// The openai SDK types don't model OpenRouter's reasoning_details, so we cast at
// this boundary only — a narrow local type, never `any` on the whole call.
type ReasoningEntry = { index?: number; text?: string; [k: string]: unknown };
type DeltaWithReasoning = { reasoning_details?: ReasoningEntry[] };
type OutgoingMessage = {
  role: LlmMessage["role"];
  content: string;
  reasoning_details?: unknown[];
};

// Merge streamed reasoning_details deltas into one ordered array: entries
// sharing an index are folded together, appending their text. Provider-specific
// (M2 :nitro) — confirmed against live output during bring-up.
function mergeReasoning(acc: ReasoningEntry[], deltas: ReasoningEntry[]): void {
  for (const d of deltas) {
    const idx = typeof d.index === "number" ? d.index : acc.length;
    const existing = acc.find((e) => e.index === idx);
    if (existing === undefined) {
      acc.push({ ...d, index: idx });
    } else {
      const text =
        (typeof existing.text === "string" ? existing.text : "") +
        (typeof d.text === "string" ? d.text : "");
      Object.assign(existing, d, { index: idx, text });
    }
  }
}
```

Rewrite the body of `stream` (lines 43–62) to map the outgoing messages and
capture reasoning:

```ts
const outgoing: OutgoingMessage[] = messages.map((m) =>
  m.role === "assistant" && m.reasoningDetails !== undefined
    ? {
        role: m.role,
        content: m.content,
        reasoning_details: m.reasoningDetails,
      }
    : { role: m.role, content: m.content },
);
const completion = await client.chat.completions.create(
  {
    model,
    messages:
      outgoing as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    stream: true,
    // Ask for a final usage chunk (empty choices + usage) so we can report
    // output tok/s. Providers that don't send it simply never fire onUsage.
    stream_options: { include_usage: true },
  },
  { signal: opts.signal },
);
const reasoning: ReasoningEntry[] = [];
for await (const chunk of completion) {
  const choice = chunk.choices[0];
  const delta = choice?.delta?.content;
  if (delta) yield delta;
  const rd = (choice?.delta as DeltaWithReasoning | undefined)
    ?.reasoning_details;
  if (rd) mergeReasoning(reasoning, rd);
  const usage = chunk.usage;
  if (usage != null) {
    opts.onUsage?.({ completionTokens: usage.completion_tokens });
  }
}
// Surface the assembled reasoning once, at natural completion only — an early
// break (barge-in / abort) calls the generator's return() and skips this, so a
// truncated reasoning block is never handed back.
if (reasoning.length > 0) opts.onReasoning?.(reasoning);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/llm/client.test.ts` Expected: PASS (new reasoning
tests + the pre-existing content/signal tests).

- [ ] **Step 5: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run format` Expected: clean;
commit any format changes.

```bash
git add src/lib/llm/client.ts src/lib/llm/client.test.ts
git commit -m "Companions: LLM client captures and replays OpenRouter reasoning_details"
```

---

## Task 3: Companion config — `passesReasoning`

**Files:**

- Modify: `src/lib/companions/companions.ts:3-22`
- Test: `src/lib/companions/companions.test.ts`

**Interfaces:**

- Produces (relied on by Task 4): `Companion.passesReasoning: boolean`;
  `ELISE.passesReasoning === true`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/companions/companions.test.ts` inside `describe("Elise", ...)`:

```ts
it("passes reasoning back to the model (M2 is a reasoning model)", () => {
  expect(ELISE.passesReasoning).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/companions/companions.test.ts` Expected: FAIL —
`ELISE.passesReasoning` is `undefined`.

- [ ] **Step 3: Add the field**

In `src/lib/companions/companions.ts`, add to the `Companion` type (after line
9, `contextWindow`):

```ts
passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
```

And to the `ELISE` object (after line 21, `contextWindow: 196608,`):

```ts
  passesReasoning: true,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/companions/companions.test.ts` Expected: PASS.

- [ ] **Step 5: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run format` Expected: clean.

```bash
git add src/lib/companions/companions.ts src/lib/companions/companions.test.ts
git commit -m "Companions: add passesReasoning flag (Elise = true)"
```

---

## Task 4: Wire the thread into `use-voice-session.ts`

**Files:**

- Modify: `src/hooks/use-voice-session.ts` — imports, `VoiceStatus`,
  `IDLE_STATUS`, `VoiceSession`, `useVoiceSession` body (`submitText`, `stop`,
  return), plus a mount-seed effect, a `persistThread` helper, and
  `clearThread`.

**Interfaces:**

- Consumes: `appendUser`, `appendAssistant`, `toLlmMessages`, `parse`,
  `serialize`, `type Thread`, `type ThreadTurn` from
  `@/lib/companions/conversation`; `ELISE.passesReasoning`; `stream`'s new
  `onReasoning`.
- Produces (relied on by Task 5): `VoiceStatus.thread: ThreadTurn[]`;
  `VoiceSession.clearThread: () => void`.

**No unit test** (integration wiring, per the file's own header). Verified by
typecheck + build + driving the app.

- [ ] **Step 1: Add imports and the storage key**

After the existing imports (line 24) add:

```ts
import {
  appendAssistant,
  appendUser,
  parse,
  serialize,
  toLlmMessages,
  type Thread,
  type ThreadTurn,
} from "@/lib/companions/conversation";
```

Below the timeout constants (after line 84) add:

```ts
// Per-companion persistence key, so a second companion (Phase 12) gets its own
// thread.
const THREAD_KEY = `companions:thread:${ELISE.name.toLowerCase()}`;
```

- [ ] **Step 2: Extend `VoiceStatus`, `IDLE_STATUS`, and `VoiceSession`**

In `VoiceStatus` (add after `awaitingSpeech: boolean;`, line 49):

```ts
  // The rolling conversation transcript, mirrored from threadRef so the panel
  // can render it. Reset to [] on Clear, but preserved across Stop-listening.
  thread: ThreadTurn[];
```

In `IDLE_STATUS` (add after `awaitingSpeech: false,`, line 79):

```ts
  thread: [],
```

In `VoiceSession` (add after `cancelReply` / before `status`, around line 62):

```ts
  // Wipe the conversation: empties the live thread, the mirror, and the
  // localStorage key. Button-only (no spoken word), instant, no confirm.
  clearThread: () => void;
```

- [ ] **Step 3: Add the thread ref, seed effect, and persist/clear helpers**

After `intervalRef` (line 106) add:

```ts
// The live conversation thread — source of truth, read/written inside the
// once-created callbacks like the other live refs, mirrored into status.thread.
const threadRef = useRef<Thread>([]);
```

After the `setReplyPlaying` callback (line 111) add:

```ts
// Write-through persistence: every thread mutation updates the ref, the
// mirror, and localStorage together. Storage failures (quota/unavailable) are
// swallowed — the in-memory thread still works for this session.
const persistThread = useCallback((thread: Thread): void => {
  threadRef.current = thread;
  setStatus((s) => ({ ...s, thread }));
  try {
    localStorage.setItem(THREAD_KEY, serialize(thread));
  } catch {
    // ignore: storage full or unavailable
  }
}, []);

const clearThread = useCallback((): void => {
  threadRef.current = [];
  setStatus((s) => ({ ...s, thread: [] }));
  try {
    localStorage.removeItem(THREAD_KEY);
  } catch {
    // ignore: storage unavailable
  }
}, []);

// Restore a persisted conversation on mount so a reload keeps the memory.
// localStorage is browser-only, so this runs in an effect, not at ref init.
useEffect(() => {
  const seeded = parse(localStorage.getItem(THREAD_KEY));
  threadRef.current = seeded;
  setStatus((s) => ({ ...s, thread: seeded }));
}, []);
```

- [ ] **Step 4: Commit the user turn and build the request from the thread**

In `submitText`, immediately after the `const speak = ...` line (line 151) add
the user commit:

```ts
// Commit the user turn the moment it's submitted (ref + state + persist).
persistThread(appendUser(threadRef.current, prompt));
```

Then, inside the async IIFE, add a reasoning local next to `reply` (after line
168 `let reply = "";`):

```ts
let reasoning: unknown[] | undefined;
```

Replace the inline messages array and opts in the `llm.stream(...)` call (lines
172–183) with the thread projection plus `onReasoning`:

```ts
          for await (const delta of llm.stream(
            toLlmMessages(
              threadRef.current,
              ELISE.systemPrompt,
              ELISE.passesReasoning,
            ),
            {
              signal: controller.signal,
              onUsage: (u) => {
                completionTokens = u.completionTokens;
              },
              onReasoning: (d) => {
                reasoning = d;
              },
            },
          )) {
```

- [ ] **Step 5: Commit the assistant turn on generation-complete**

After the LLM-metrics `setStatus` block closes (immediately after line 211's
`}`), and **before** the `if (... || !speak) return;` guard (line 212), add:

```ts
// Generation completed under this turn's guard (a mid-generation cut
// returned earlier), so the full reply + full reasoning are in hand:
// commit the assistant turn. reasoning is replayed only when the
// companion passes it; a superseded/aborted turn never reaches here,
// so no truncated reasoning block is ever stored.
if (reply.trim() !== "") {
  persistThread(
    appendAssistant(
      threadRef.current,
      reply,
      ELISE.passesReasoning ? reasoning : undefined,
    ),
  );
}
```

Add `persistThread` to `submitText`'s dependency array (line 261): change
`[ensureClients, setReplyPlaying]` to
`[ensureClients, setReplyPlaying, persistThread]`.

- [ ] **Step 6: Preserve the transcript across `stop()`, and export
      `clearThread`**

In `stop()`, replace `setStatus(IDLE_STATUS);` (line 364) with:

```ts
// The conversation persists across Stop-listening — only Clear (or a fresh
// load) resets it — so re-seed the mirror from the intact threadRef.
setStatus({ ...IDLE_STATUS, thread: threadRef.current });
```

In the return object (line 370), add `clearThread`:

```ts
return { start, stop, submitText, cancelReply, clearThread, status, audioRef };
```

- [ ] **Step 7: Gate**

Run: `npm run typecheck && npm run lint` Expected: both silent / zero warnings.
(No unit test for the hook.)

- [ ] **Step 8: Manual drive checkpoint**

Run: `npm run build` (catches RSC/Next issues the dev server tolerates), then
`npm run dev` and open http://localhost:8931. Go to Companions → Begin. Type a
message, Send; type a second referring to the first and confirm continuity is
possible (thread is being sent). Reload — confirm the transcript is not yet
rendered (Task 5) but check `localStorage` under key `companions:thread:elise`
is populated (DevTools → Application → Local Storage). This is an intermediate
checkpoint; full behaviour lands with Task 5.

- [ ] **Step 9: Commit**

Run: `npm run format` and commit any changes.

```bash
git add src/hooks/use-voice-session.ts
git commit -m "Companions: hold, persist and replay the conversation thread in the voice session"
```

---

## Task 5: Conversation UI — iMessage-style transcript + Clear

**Files:**

- Modify: `src/components/algorithms/companions-panel.tsx` — destructure
  `clearThread`; add a `ChatBubble` component; replace the flat "Response"
  preview (lines 421–446) with a transcript; add the Clear button to the
  composer row.

**Interfaces:**

- Consumes: `status.thread` (`ThreadTurn[]`), `status.replyText`,
  `status.replyPlaying`, `status.replyError`, `status.awaitingSpeech`, and
  `clearThread` from `useVoiceSession()`.

**No unit test** (UI). Gated by typecheck/lint/build + manual bring-up. Apply
frontend-design polish to the bubbles; the classes below are a working, on-brand
starting point (accent `bg-blue-600`, muted `bg-foreground/10`, matching the
composer buttons).

- [ ] **Step 1: Destructure `clearThread`**

In the `useVoiceSession()` destructure (lines 104–110), add `clearThread`:

```ts
const {
  start: startListening,
  stop: stopListening,
  submitText,
  cancelReply,
  clearThread,
  status,
  audioRef,
} = useVoiceSession();
```

- [ ] **Step 2: Add the `ChatBubble` component**

Add near `Spinner` (after line 87):

```tsx
// One transcript row: user turns right-aligned in the accent colour, Elise's
// left-aligned and muted. `pending` dims the in-progress reply until it folds
// into the thread.
function ChatBubble({
  role,
  text,
  pending = false,
}: {
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser ? "bg-blue-600 text-white" : "bg-foreground/10"
        } ${pending ? "opacity-70" : ""}`}
      >
        {text}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add a Clear button to the composer row**

In the composer button row, after the Stop `<Button>` (after line 411) and
before the `<span>` status text, add:

```tsx
<Button
  onClick={clearThread}
  disabled={status.replyPlaying || status.thread.length === 0}
  className="bg-foreground/10 hover:bg-foreground/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
>
  Clear
</Button>
```

- [ ] **Step 4: Replace the flat "Response" preview with the transcript**

Replace the whole preview block (lines 421–446, the
`<div className="mt-2 text-sm">…</div>` holding the "Response" label, the
Thinking/replyText paragraph, and the "Waiting for speech…" line) with a
transcript that renders `status.thread`, an in-progress assistant bubble, the
pre-first-token spinner, and the awaiting-speech line:

```tsx
<div className="mt-3 flex flex-col gap-2">
  {status.thread.map((turn, i) => (
    <ChatBubble key={i} role={turn.role} text={turn.content} />
  ))}
  {/* In-progress reply: a live, dimmed Elise bubble that folds into
                  the thread on completion (replyPlaying flips false and the
                  committed assistant turn takes its place). */}
  {status.replyPlaying && status.replyText !== "" && (
    <ChatBubble role="assistant" text={status.replyText} pending />
  )}
  {/* Pre-first-token gap: the existing Thinking… spinner. */}
  {status.replyPlaying &&
    status.replyText === "" &&
    status.replyError === null && (
      <div className="flex justify-start">
        <p className="text-muted-foreground flex min-h-6 items-center gap-2 rounded-2xl px-3 py-2 text-sm">
          <Spinner />
          Thinking…
        </p>
      </div>
    )}
  {status.thread.length === 0 && !status.replyPlaying && (
    <p className="text-muted-foreground text-sm">No messages yet.</p>
  )}
  {status.awaitingSpeech && (
    <p className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
      <Spinner />
      Waiting for speech…
    </p>
  )}
</div>
```

Leave the `status.replyError` inline paragraph (lines 416–420) exactly where it
is — it still surfaces LLM failures above the transcript.

- [ ] **Step 5: Gate**

Run: `npm run typecheck && npm run lint && npm run build` Expected: all clean
(build too, per the zero-warning rule).

- [ ] **Step 6: Manual bring-up (the real gate)**

Run `npm run dev`, open http://localhost:8931 → Companions → Begin. Verify:

- Type and Send a message → it appears as a right accent bubble; Elise's reply
  streams into a left muted in-progress bubble, then folds into a solid bubble.
- Send a follow-up that references the first message → confirm she can recall it
  (thread continuity).
- Reload the page → the full transcript is restored and she still remembers.
- Press **Clear** → transcript empties and the `companions:thread:elise`
  localStorage key is gone; a new message starts a fresh conversation.
- Clear is disabled while a reply is in flight.
- With the mic on: barge-in mid-playback → the completed turn is in the
  transcript. Barge-in mid-generation → no partial assistant bubble is committed
  (a dangling user turn is expected/accepted this phase).
- Confirm multi-turn coherence is noticeably better than Phase 4's stateless
  turns, and (with M2) that reasoning replay is in effect.

- [ ] **Step 7: Commit**

Run: `npm run format` and commit any changes.

```bash
git add src/components/algorithms/companions-panel.tsx
git commit -m "Companions: render the conversation as a chat transcript with a Clear button"
```

---

## Task 6: Docs

**Files:**

- Modify: `COMPANIONS.md`

**No test.** Gated by `npm run format`. No `CHANGELOG.md` entry — the changelog
is updated only when the feature ships (merges to `main`), not per phase.

- [ ] **Step 1: Update the `Companion` type snippet in `COMPANIONS.md`**

In the type block (around lines 31–39), add the `passesReasoning` field so the
doc matches the code:

```ts
export type Companion = {
  name: string;
  gender: "female" | "male" | "nonbinary"; // display-only, shown on the picker
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message
  model: string; // OpenRouter model slug the client requests for this companion
  contextWindow: number; // model context window (tokens); recorded for pruning
  passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
};
```

- [ ] **Step 2: Add a short persistence + reasoning note to `COMPANIONS.md`**

After the "One config object per companion" bullet list (after line 49), add a
new subsection:

```markdown
## Conversation memory

The app keeps a **rolling conversation thread** — every user and assistant turn
— and replays it to the model on each turn, so the companion remembers what was
said earlier. The thread is persisted to `localStorage` under a per-companion
key (`companions:thread:elise`), so it survives a reload; **Clear conversation**
in the panel wipes it (button-only — Companions registers no spoken words).

`passesReasoning` marks a **reasoning model**: MiniMax M2 (Elise's model)
returns a private thinking block (`reasoning_details`) alongside its reply and
was trained with that reasoning present in history, so the app captures it from
the stream and replays it verbatim on Elise's stored turns. Elise carries
`passesReasoning: true`; a future non-reasoning companion sets it `false` and
the field is simply never sent.
```

- [ ] **Step 3: Confirm the shared design doc's phase map is consistent**

Open `docs/superpowers/specs/2026-07-18-companions-design.md`; confirm the Phase
5 entry and the phase map already describe this phase and Phases 9–12 (they were
updated in an earlier commit). If any wording still contradicts this spec (e.g.
reply-length tuning left in Phase 8, or the old two-field persona model), fix
that line to match. No change is needed if it already reads correctly.

- [ ] **Step 4: Format and commit**

Run: `npm run format` Expected: prose re-wrapped per Prettier; commit the
result.

```bash
git add COMPANIONS.md docs/superpowers/specs/2026-07-18-companions-design.md
git commit -m "Companions: document Phase 5 conversation memory and reasoning replay"
```

---

## Final Verification

- [ ] `npm test` — all unit suites green (conversation, client, companions).
- [ ] `npm run typecheck` — silent.
- [ ] `npm run lint` — zero warnings.
- [ ] `npm run build` — succeeds.
- [ ] `npm run format` — no uncommitted changes left behind.
- [ ] Manual bring-up checklist from Task 5 Step 6 passes on real
      hardware/browser.

---

## Self-Review Notes (author checklist, already applied)

- **Spec coverage:** §1 conversation module → Task 1; §2 client capture/replay →
  Task 2; §3 `passesReasoning` → Task 3; §4 hook wiring (threadRef, seed, submit
  user-commit, generation-complete assistant-commit, `clearThread`, `stop`
  preserves thread, write-through persistence) → Task 4; §5 transcript UI +
  Clear → Task 5; §6 doc updates → Task 6. Testing §: `conversation.test.ts` →
  Task 1; `client.test.ts` → Task 2; typecheck/lint/build gates in every task;
  manual bring-up → Task 5 Step 6.
- **Interrupted-turn commit rule:** user turn committed at submit (Task 4 Step
  4); assistant turn committed only under the existing generation-complete
  guard, before TTS (Task 4 Step 5) — a mid-generation cut returns earlier and
  commits nothing, and `onReasoning` only fires on natural completion (Task 2),
  so no truncated reasoning is stored.
- **Type consistency:** `Thread`/`ThreadTurn`,
  `appendUser`/`appendAssistant`/`toLlmMessages`/`serialize`/`parse`,
  `LlmMessage.reasoningDetails`, `onReasoning`, `passesReasoning`,
  `VoiceStatus.thread`, `clearThread`, and `THREAD_KEY` are named identically
  across every task.
- **No context-window culling, no confirm dialog on Clear, no spoken word for
  Clear** — honoured (Task 5 Clear is button-only; unbounded thread is
  intentional).
