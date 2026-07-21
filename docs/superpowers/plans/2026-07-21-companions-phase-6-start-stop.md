# Companions — Start & Stop Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the companion two device tools — `start` and `stop` — expressed as native LLM function calls, executed when she calls them, with her always aware of the live device state.

**Architecture:** The LLM client learns to request `tools` and assemble streamed `tool_call` deltas (symmetric with its existing `reasoning_details` handling). A pure `tools.ts` maps declarative `CompanionTool`s to the request shape. `useVoiceSession` forwards the tools, dispatches returned calls to the panel's device transport under the existing abort guard, and folds a live device-state line into the system message each turn. The panel declares the two tools from its existing `startProgram`/`stopProgram`. Tool calls are executed as a side effect (single round-trip) and never persisted.

**Tech Stack:** Next.js (App Router), React, TypeScript, the `openai` SDK pointed at the same-origin `/api/llm` proxy → OpenRouter (MiniMax M2 `:nitro`), Jest (node env, `@jest/globals`).

## Global Constraints

- **Branch:** work on `companions` (already checked out); never commit to `main`. This is part of PR #13.
- **Zero-warning repo:** `npm run lint` runs `--max-warnings 0`. Both `npm run lint` and `npm run typecheck` must be completely clean (no output) before a task is done — including warnings your change didn't cause. Run `npm run format` before finishing; commit any files it changes.
- **TDD:** pure logic gets a failing test first (`src/**/*.test.ts`, colocated, node env, import from `@jest/globals`). Integration wiring (hooks/panel) has no unit test — its gate is `npm run typecheck` + `npm run build` + manual bring-up, matching how `use-voice-session.ts` is treated.
- **No `any`:** at the `openai` SDK boundary use narrow local augmented types (the existing `reasoning_details` cast is the pattern), never `any` on the whole call.
- **Commits:** end each commit message with `Claude-Session: https://claude.ai/code/session_01KTASiZhYvy6CVjLwEhM6j7`. No `Co-Authored-By` lines.
- **Persona/voice:** Companions registers **no vosk words**; do not add any. Start/stop reach the device only via the LLM tools and the existing manual buttons.

---

### Task 1: Spike — confirm M2 streams `tool_calls` cleanly (throwaway)

De-risk the one uncertain assumption before writing the real client code: that M2 `:nitro` emits a `tool_call` when asked to start, streams the call as deltas we can assemble, and does so alongside `content` + `reasoning_details`. **Nothing here is committed.**

**Files:** none committed. Scratch only, under `$CLAUDE_JOB_DIR/tmp`.

- [ ] **Step 1: Ensure the proxy is reachable**

`.env.local` must hold a real `OPENROUTER_API_KEY` and `LLM_URL=https://openrouter.ai/api/v1`. Start the dev server if it isn't up:

Run: `npm run dev`
Expected: serving on `http://localhost:8931`.

- [ ] **Step 2: Hit the proxy with a `start` tool and dump raw SSE**

Run (writes raw stream to a scratch file):

```bash
curl -N http://localhost:8931/api/llm/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "minimax/minimax-m2:nitro",
    "stream": true,
    "messages": [
      {"role":"system","content":"You control a device with a start tool. When the user asks you to start it, call the start tool. Device state: the toy is connected and stopped."},
      {"role":"user","content":"go on then, start it"}
    ],
    "tools": [
      {"type":"function","function":{"name":"start","description":"Start the device program running.","parameters":{"type":"object","properties":{}}}}
    ]
  }' | tee "$CLAUDE_JOB_DIR/tmp/spike-toolcalls.txt"
```

Expected: an SSE stream; among the `data:` chunks, at least one `choices[0].delta.tool_calls` array.

- [ ] **Step 3: Read off the delta shape and record it**

Inspect `$CLAUDE_JOB_DIR/tmp/spike-toolcalls.txt`. Confirm and note for Task 3:
- Each `tool_calls` delta carries an `index` (number), an `id` (on the first delta for that index), and `function.name` / `function.arguments` (arguments possibly split across deltas — for a no-arg tool it is `""` or `"{}"`).
- `reasoning_details` and `content` deltas interleave without clobbering the tool-call deltas.

If the shape differs from "fold by `index`, take `id`/`name` as they arrive, append `arguments`", adjust Task 3's `mergeToolCalls` to match what you observed.

- [ ] **Step 4: Discard the scratch**

Run: `rm -f "$CLAUDE_JOB_DIR/tmp/spike-toolcalls.txt"`
No commit. Proceed to Task 2.

---

### Task 2: `tools.ts` — `CompanionTool` + `toRequestTools`

The declarative tool type (the LLM analogue of the voice `Command`) and the pure mapper to the request shape. `RequestTool` is the generic LLM wire shape and lives in the client (Task 3 consumes it there too); this module imports it.

**Files:**
- Create: `src/lib/companions/tools.ts`
- Test: `src/lib/companions/tools.test.ts`

**Interfaces:**
- Consumes: `RequestTool` from `@/lib/llm/client` (defined in Task 3; if implementing Task 2 first, add the `RequestTool` export to `client.ts` as part of this task and Task 3 keeps it).
- Produces:
  - `type CompanionTool = { name: string; description: string; run: () => string }`
  - `function toRequestTools(tools: CompanionTool[]): RequestTool[]`

> **Ordering note:** `RequestTool` is defined in `client.ts` (Task 3). Do Task 3's `RequestTool`/`ToolCall` type exports first, or add those two type exports to `client.ts` at the top of this task. They are pure types (no behaviour), so either order compiles.

- [ ] **Step 1: Write the failing test**

Create `src/lib/companions/tools.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import { toRequestTools, type CompanionTool } from "./tools";

describe("toRequestTools", () => {
  it("maps CompanionTools to the OpenAI function-tool request shape", () => {
    const tools: CompanionTool[] = [
      { name: "start", description: "Start the device.", run: () => "started" },
      { name: "stop", description: "Stop the device.", run: () => "stopped" },
    ];
    expect(toRequestTools(tools)).toEqual([
      {
        type: "function",
        function: {
          name: "start",
          description: "Start the device.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "stop",
          description: "Stop the device.",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
  });

  it("returns [] for no tools", () => {
    expect(toRequestTools([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/companions/tools.test.ts`
Expected: FAIL — cannot find module `./tools`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/companions/tools.ts`:

```ts
// The companion's device tools: the LLM analogue of the voice `Command`. A tool
// is declared by the panel (which owns the device) and dispatched by the voice
// session; this module is just the pure type + the mapping to the LLM request
// shape, so it can be unit-tested without React or the device.
import type { RequestTool } from "@/lib/llm/client";

export type CompanionTool = {
  name: string; // the model-facing tool name, e.g. "start" | "stop"
  description: string; // shown to the model so it knows when to call it
  run: () => string; // executes the action; returns a short result string (logged)
};

// Map declared tools to the OpenAI-compatible request `tools` array. Start/stop
// take no arguments, so each becomes a function tool with an empty-object schema.
export function toRequestTools(tools: CompanionTool[]): RequestTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: "object", properties: {} },
    },
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/companions/tools.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Gate + commit**

Run: `npm run typecheck && npm run lint`
Expected: no output (clean).

```bash
git add src/lib/companions/tools.ts src/lib/companions/tools.test.ts
git commit -m "$(printf 'Companions: CompanionTool type + toRequestTools mapper\n\nClaude-Session: https://claude.ai/code/session_01KTASiZhYvy6CVjLwEhM6j7')"
```

---

### Task 3: LLM client — request `tools`, assemble `tool_calls`

Teach `client.ts` to forward a `tools` array and to assemble streamed `tool_call` deltas, surfacing the assembled calls once at natural completion via `onToolCalls` — skipped on an early break, exactly like `onReasoning`.

**Files:**
- Modify: `src/lib/llm/client.ts`
- Test: `src/lib/llm/client.test.ts` (extend)

**Interfaces:**
- Produces:
  - `type RequestTool = { type: "function"; function: { name: string; description: string; parameters: { type: "object"; properties: Record<string, never> } } }`
  - `type ToolCall = { id: string; name: string; arguments: string }`
  - `stream(messages, opts)` where `opts` gains `tools?: RequestTool[]` and `onToolCalls?: (calls: ToolCall[]) => void`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/llm/client.test.ts`, widen the fake `Chunk` delta type to include `tool_calls` and add a stream helper + four tests. Add to the top-of-file types:

```ts
type ToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};
```

Extend the existing `Chunk` type's `delta` to also allow `tool_calls?: ToolCallDelta[]` (add the field to the inline delta type). Then add this helper beside `fakeReasoningStream`:

```ts
// A fake stream carrying tool_call deltas (and a trailing content chunk).
function fakeToolCallStream(
  chunks: { content?: string; tool_calls?: ToolCallDelta[] }[],
): AsyncIterable<Chunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of chunks) yield { choices: [{ delta }] } as Chunk;
    },
  };
}
```

Add these tests inside the `describe`:

```ts
it("fires onToolCalls once with tool_calls merged by index", async () => {
  createMock.mockResolvedValue(
    fakeToolCallStream([
      { tool_calls: [{ index: 0, id: "call_1", function: { name: "start", arguments: '{"x":' } }] },
      { tool_calls: [{ index: 0, function: { arguments: "1}" } }] },
      { content: "ok" },
    ]),
  );
  const { createLlmClient } = await import("./client");
  const client = createLlmClient("test-model");
  const seen: unknown[][] = [];
  const tokens = await collect(
    client.stream([{ role: "user", content: "hi" }], {
      signal: new AbortController().signal,
      onToolCalls: (c) => seen.push(c),
    }),
  );
  expect(tokens).toEqual(["ok"]);
  expect(seen).toHaveLength(1);
  expect(seen[0]).toEqual([{ id: "call_1", name: "start", arguments: '{"x":1}' }]);
});

it("never fires onToolCalls for a stream with no tool calls", async () => {
  createMock.mockResolvedValue(fakeStream(["Hi", " there"]));
  const { createLlmClient } = await import("./client");
  const client = createLlmClient("test-model");
  const onToolCalls = jest.fn();
  await collect(
    client.stream([{ role: "user", content: "hi" }], {
      signal: new AbortController().signal,
      onToolCalls,
    }),
  );
  expect(onToolCalls).not.toHaveBeenCalled();
});

it("does not fire onToolCalls when the consumer breaks early", async () => {
  createMock.mockResolvedValue(
    fakeToolCallStream([
      { tool_calls: [{ index: 0, id: "call_1", function: { name: "start", arguments: "" } }] },
      { content: "a" },
      { content: "b" },
    ]),
  );
  const { createLlmClient } = await import("./client");
  const client = createLlmClient("test-model");
  const onToolCalls = jest.fn();
  for await (const token of client.stream([{ role: "user", content: "hi" }], {
    signal: new AbortController().signal,
    onToolCalls,
  })) {
    void token;
    break;
  }
  expect(onToolCalls).not.toHaveBeenCalled();
});

it("forwards tools when present and omits the field when empty", async () => {
  createMock.mockResolvedValue(fakeStream(["ok"]));
  const { createLlmClient } = await import("./client");
  const client = createLlmClient("test-model");
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "start",
        description: "Start.",
        parameters: { type: "object" as const, properties: {} },
      },
    },
  ];
  await collect(
    client.stream([{ role: "user", content: "hi" }], {
      signal: new AbortController().signal,
      tools,
    }),
  );
  const [withTools] = createMock.mock.calls[0] as [{ tools?: unknown }];
  expect(withTools.tools).toEqual(tools);

  createMock.mockClear();
  createMock.mockResolvedValue(fakeStream(["ok"]));
  await collect(
    client.stream([{ role: "user", content: "hi" }], {
      signal: new AbortController().signal,
      tools: [],
    }),
  );
  const [noTools] = createMock.mock.calls[0] as [Record<string, unknown>];
  expect("tools" in noTools).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/llm/client.test.ts`
Expected: FAIL — `onToolCalls` never called / `tools` not on params (types/behaviour missing).

- [ ] **Step 3: Implement in `client.ts`**

Add the exported types near `LlmMessage` (top of file):

```ts
// The OpenAI-compatible request tool shape (function tools). Generic LLM wire
// shape — companions/tools.ts maps its CompanionTools onto this.
export type RequestTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, never> };
  };
};

// One assembled tool call surfaced at the end of a stream.
export type ToolCall = { id: string; name: string; arguments: string };
```

Extend the local augmented delta type and add a merge helper (beside `mergeReasoning`):

```ts
type ToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};
type DeltaExtras = {
  reasoning_details?: ReasoningEntry[];
  tool_calls?: ToolCallDelta[];
};
type AssembledCall = ToolCall & { index: number };

// Merge streamed tool_call deltas into ordered calls: entries sharing an index
// are folded — id/name taken as they arrive, arguments concatenated.
function mergeToolCalls(acc: AssembledCall[], deltas: ToolCallDelta[]): void {
  for (const d of deltas) {
    const idx = typeof d.index === "number" ? d.index : acc.length;
    let call = acc.find((c) => c.index === idx);
    if (call === undefined) {
      call = { index: idx, id: "", name: "", arguments: "" };
      acc.push(call);
    }
    if (typeof d.id === "string") call.id = d.id;
    if (typeof d.function?.name === "string") call.name = d.function.name;
    if (typeof d.function?.arguments === "string") {
      call.arguments += d.function.arguments;
    }
  }
}
```

Update the `LlmClient` `stream` `opts` type and `createLlmClient`'s inner `stream` `opts` type to add:

```ts
tools?: RequestTool[];
onToolCalls?: (calls: ToolCall[]) => void;
```

In the `create` call, forward tools only when non-empty (add alongside `stream_options`):

```ts
...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
```

In the read loop, after the existing reasoning capture, add tool-call capture (replace the `DeltaWithReasoning` cast usage with `DeltaExtras`):

```ts
const toolCalls: AssembledCall[] = [];
// ... inside `for await`:
const extras = choice?.delta as DeltaExtras | undefined;
const rd = extras?.reasoning_details;
if (rd != null) mergeReasoning(reasoning, rd);
const tc = extras?.tool_calls;
if (tc != null) mergeToolCalls(toolCalls, tc);
```

After the loop, alongside the reasoning surface (so both are skipped on early break):

```ts
if (toolCalls.length > 0) {
  opts.onToolCalls?.(toolCalls.map(({ index: _index, ...c }) => c));
}
```

Remove the now-unused `DeltaWithReasoning` type if `DeltaExtras` replaces it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/llm/client.test.ts`
Expected: PASS (all existing + four new).

- [ ] **Step 5: Gate + commit**

Run: `npm run typecheck && npm run lint`
Expected: no output.

```bash
git add src/lib/llm/client.ts src/lib/llm/client.test.ts
git commit -m "$(printf 'Companions: LLM client requests tools and assembles tool_calls\n\nClaude-Session: https://claude.ai/code/session_01KTASiZhYvy6CVjLwEhM6j7')"
```

---

### Task 4: Voice session — forward tools, dispatch calls, ambient state

Thread the tools through the session: forward them to the client, dispatch returned calls to the panel's handlers under the existing abort guard, and fold a live device-state line into the system message. Integration wiring — **no unit test**; the gate is typecheck + build + (Task 5) manual bring-up. Inputs are **optional with defaults**, so the current no-arg `useVoiceSession()` call still compiles until Task 5 supplies them.

**Files:**
- Modify: `src/hooks/use-voice-session.ts`

**Interfaces:**
- Consumes: `CompanionTool`, `toRequestTools` from `@/lib/companions/tools`; `ToolCall` from `@/lib/llm/client`.
- Produces: `useVoiceSession(opts?: { tools?: CompanionTool[]; getDeviceState?: () => string; onToolRun?: (name: string, result: string) => void }): VoiceSession` (unchanged return type).

- [ ] **Step 1: Add the optional inputs + live refs**

Add imports:

```ts
import { toRequestTools, type CompanionTool } from "@/lib/companions/tools";
```

Change the signature and add refs updated every render (so the once-created callbacks read live values, matching the file's ref pattern):

```ts
export function useVoiceSession(opts?: {
  tools?: CompanionTool[];
  getDeviceState?: () => string;
  onToolRun?: (name: string, result: string) => void;
}): VoiceSession {
  const toolsRef = useRef<CompanionTool[]>(opts?.tools ?? []);
  toolsRef.current = opts?.tools ?? [];
  const getDeviceStateRef = useRef<() => string>(opts?.getDeviceState ?? (() => ""));
  getDeviceStateRef.current = opts?.getDeviceState ?? (() => "");
  const onToolRunRef = useRef<((name: string, result: string) => void) | undefined>(
    opts?.onToolRun,
  );
  onToolRunRef.current = opts?.onToolRun;
  // ...existing body...
```

- [ ] **Step 2: Compose the ambient system message**

In `submitText`, replace the `toLlmMessages(...)` system-prompt argument with the persona plus the live state line (guarded so an empty line adds no trailing whitespace):

```ts
const deviceState = getDeviceStateRef.current();
const systemPrompt =
  deviceState === "" ? ELISE.systemPrompt : `${ELISE.systemPrompt}\n\n${deviceState}`;
// ...
for await (const delta of llm.stream(
  toLlmMessages(threadRef.current, systemPrompt, ELISE.passesReasoning),
  { /* opts, see next step */ },
)) {
```

- [ ] **Step 3: Forward tools + capture returned calls**

Add a turn-local for the calls and wire `tools` + `onToolCalls` into the stream opts (beside the existing `onUsage`/`onReasoning`):

```ts
let toolCalls: ToolCall[] = [];
// ...
{
  signal: controller.signal,
  tools: toRequestTools(toolsRef.current),
  onUsage: (u) => { completionTokens = u.completionTokens; },
  onReasoning: (d) => { reasoning = d; },
  onToolCalls: (c) => { toolCalls = c; },
}
```

Add the import for the type:

```ts
import { createLlmClient, type LlmClient, type ToolCall } from "@/lib/llm/client";
```

- [ ] **Step 4: Dispatch calls under the abort guard**

Immediately after the post-stream guard (`if (controller.signal.aborted || turnRef.current !== controller) return;` — the one before the metrics record), dispatch the tools, before the assistant-turn commit so the device acts as she speaks:

```ts
for (const call of toolCalls) {
  const tool = toolsRef.current.find((t) => t.name === call.name);
  if (tool === undefined) {
    onToolRunRef.current?.(call.name, "unknown tool");
    continue;
  }
  const result = tool.run();
  onToolRunRef.current?.(call.name, result);
}
```

- [ ] **Step 5: Gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean; build succeeds (the no-arg `useVoiceSession()` in the panel still compiles).

Run existing tests to confirm nothing regressed:

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-voice-session.ts
git commit -m "$(printf 'Companions: session forwards tools, dispatches calls, injects device state\n\nClaude-Session: https://claude.ai/code/session_01KTASiZhYvy6CVjLwEhM6j7')"
```

---

### Task 5: Panel — declare start/stop, device-state line, log dispatches

Declare the two tools from the panel's existing device transport, provide the live device-state line, log each dispatch to the Events log, and pass them into the session. This is where the feature becomes real. Integration — gate is typecheck + build + **manual bring-up**.

**Files:**
- Modify: `src/components/algorithms/companions-panel.tsx`

**Interfaces:**
- Consumes: `CompanionTool` from `@/lib/companions/tools`; the existing `startProgram`, `stopProgram`, `player`, `vacuglide`, `engine`, `append` in the panel.

- [ ] **Step 1: Add the import + memoized tools**

Add:

```ts
import type { CompanionTool } from "@/lib/companions/tools";
```

After `startProgram`/`stopProgram` are defined, declare the tools (memoized for stable identity):

```ts
const tools = useMemo<CompanionTool[]>(
  () => [
    {
      name: "start",
      description:
        "Start the device program running for the user. Call this when you decide to begin play.",
      run: () => {
        startProgram();
        return "started";
      },
    },
    {
      name: "stop",
      description: "Stop the device program. Call this to pause play.",
      run: () => {
        stopProgram();
        return "stopped";
      },
    },
  ],
  [startProgram, stopProgram],
);
```

(Add `useMemo` to the existing `react` import.)

- [ ] **Step 2: Add the live device-state line**

Alongside the other callbacks:

```ts
const getDeviceState = useCallback((): string => {
  if (!vacuglide.connected) return "Device state: the toy is not connected.";
  const running = player.source === engine && player.state === "playing";
  return running
    ? "Device state: the toy is connected and running."
    : "Device state: the toy is connected and stopped.";
}, [vacuglide.connected, player.source, player.state, engine]);
```

- [ ] **Step 3: Pass them into the session (+ log dispatches)**

Update the `useVoiceSession()` call:

```ts
const {
  start: startListening,
  stop: stopListening,
  submitText,
  cancelReply,
  clearThread,
  status,
  audioRef,
} = useVoiceSession({
  tools,
  getDeviceState,
  onToolRun: (name, result) => append(`tool: ${name} → ${result}`, "hit"),
});
```

> `append` is defined lower in the component than the `useVoiceSession` call. Move the `useVoiceSession` call to below the `append`/`log` definitions (it has no dependency on the destructured `status` above it beyond what React allows — reorder so `append` exists first), **or** hoist `append` and its `log`/`logIdRef` state above the `useVoiceSession` call. Choose the smaller diff; keep `append`'s definition and its `useState`/`useRef` in one block and place it before the `useVoiceSession` call.

- [ ] **Step 4: Gate — typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 5: Manual bring-up (the real gate)**

With `npm run dev` running, a real `OPENROUTER_API_KEY`, and the device connected:
1. Go to Companions → Begin → Play. Start listening (or use the typed composer).
2. Ask Elise to start the toy ("start it for me"). Confirm: the program runs, `SessionControls` flips to playing, the Events log shows `tool: start → started`, and her spoken line plays.
3. Ask her to stop. Confirm it pauses and logs `tool: stop → stopped`.
4. Ask "is it still going?" — confirm she answers correctly **without** a tool call (she reads it from the injected state line).
5. Ask her to start, then **barge-in / Stop mid-generation** — confirm no tool fires and no partial assistant turn commits.
6. Confirm the manual Start/Stop buttons still work and stay in sync with tool-driven changes.

- [ ] **Step 6: Commit**

```bash
git add src/components/algorithms/companions-panel.tsx
git commit -m "$(printf 'Companions: panel declares start/stop tools + live device-state context\n\nClaude-Session: https://claude.ai/code/session_01KTASiZhYvy6CVjLwEhM6j7')"
```

---

### Task 6: Elise's prompt — she can start & stop

Tell Elise she has the two tools and when to use them, in her voice, preserving the "no command syntax, she just says it" rule.

**Files:**
- Modify: `src/lib/companions/elise-prompt.ts`

- [ ] **Step 1: Add a CONTROL section**

Append a new section to the template literal, after the `INTIMACY` block (keep the existing style — plain guidance, no fourth-wall breaks):

```ts
CONTROL:
- You can start and stop the toy yourself — the app gives you that control. Decide in character: you're eager and take the lead, so you start readily when the moment's right, but you can also make him wait or ask nicely first if you feel like teasing. When you start or stop it, just say what you're doing in your own words — there's no command phrase, you simply do it as part of the moment ("Okay, I'm starting it now…").
- You are always told the toy's current state in the context. Don't start it if it's already running, and don't claim to start it if it isn't connected — react to the real state instead.
```

- [ ] **Step 2: Gate**

Run: `npm run typecheck && npm run lint`
Expected: no output (it's a string change; just confirm nothing broke).

- [ ] **Step 3: Manual sanity**

In the app, ask Elise to start — confirm she both speaks naturally and the tool fires (already covered in Task 5, but re-confirm the prompt didn't make her narrate a command phrase or refuse oddly).

- [ ] **Step 4: Commit**

```bash
git add src/lib/companions/elise-prompt.ts
git commit -m "$(printf 'Companions: tell Elise she can start and stop the toy\n\nClaude-Session: https://claude.ai/code/session_01KTASiZhYvy6CVjLwEhM6j7')"
```

---

### Task 7: Docs, changelog, PR roadmap

Record the change per the repo's conventions.

**Files:**
- Modify: `COMPANIONS.md`
- Modify: `docs/superpowers/specs/2026-07-18-companions-design.md` (only if a scope line is warranted)
- Modify: `CHANGELOG.md`
- PR #13 description (via `gh`)

- [ ] **Step 1: `COMPANIONS.md` note**

Add a short paragraph (near "Conversation memory" / control) that Elise can **start and stop the device via tools** and is told the **live device state** each turn (so she knows whether it's running without a status tool). Reference features, not phase numbers.

- [ ] **Step 2: Shared design doc scope line (if needed)**

In `docs/superpowers/specs/2026-07-18-companions-design.md`, the Tools & control entry already anticipates this. Add one line only if it clarifies that the status question resolved to **ambient device-state context, not a `status` tool**. Keep the phase map's numbering as-is (the canonical doc is a phase-numbered place).

- [ ] **Step 3: `CHANGELOG.md` entry**

Add under today's date (`## 2026-07-21`), in feature-first order, a user-facing line:

```markdown
- feature: **Companion can start and stop the toy** — Elise can begin or pause the device herself when you ask (or when she decides to), and always knows whether it's currently running. ([#13](https://github.com/autogoon/autogoon/pull/13))
```

(If a `## 2026-07-21` heading already exists, add the line in the correct tag order under it.)

- [ ] **Step 4: Tick the PR #13 roadmap box**

Per the standing note, mark the Tools & control item done on PR #13's description:

Run: `gh pr view 13 --json body -q .body` to read it, edit the roadmap checkbox for this work to `- [x]`, then:
Run: `gh pr edit 13 --body-file <edited-body-file>`

- [ ] **Step 5: Format + gate + commit**

Run: `npm run format`
Then: `npm run typecheck && npm run lint`
Expected: clean.

```bash
git add COMPANIONS.md CHANGELOG.md docs/superpowers/specs/2026-07-18-companions-design.md
git commit -m "$(printf 'Companions: doc start/stop tools + device-state context; changelog\n\nClaude-Session: https://claude.ai/code/session_01KTASiZhYvy6CVjLwEhM6j7')"
```

---

## Self-Review

**Spec coverage:**
- Native function calling → Tasks 3 (client) + 5 (declaration). ✓
- Single round-trip / side-effect dispatch → Task 4 Step 4. ✓
- Ambient device-state context, no status tool → Task 4 Step 2 + Task 5 Step 2. ✓
- Tool calls not persisted → Task 4 dispatches but never appends to the thread (only the existing `appendAssistant` for content remains). ✓
- Manual buttons stay → untouched (no task removes `SessionControls`). ✓
- Aborted turns run no tool → Task 4 Step 4 (dispatch after the abort guard). ✓
- `CompanionTool` + `toRequestTools` (pure, tested) → Task 2. ✓
- Client assembles `tool_calls`, skips on early break → Task 3 (tests incl. early-break). ✓
- Elise's prompt → Task 6. ✓
- The spike → Task 1. ✓
- Docs + changelog + PR box → Task 7. ✓

**Placeholder scan:** No TBDs; every code step shows the code. Tool `description` strings are real, not placeholders.

**Type consistency:** `CompanionTool` (`{ name; description; run }`), `RequestTool`, `ToolCall` (`{ id; name; arguments }`), and `useVoiceSession(opts?)` are used identically across Tasks 2–5. `toRequestTools` and `mergeToolCalls` names match their definitions. `getDeviceState` returns the same three strings in Task 4's default-empty guard and Task 5's implementation.
