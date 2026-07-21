# Companions — Phase 6: Tools & control (start & stop)

> **Status:** implemented. Builds on
> [companions-design.md](./2026-07-18-companions-design.md) (the shared context)
> and the completed conversation-thread + persistence work. This spec covers the
> **`start` and `stop` tools** — the action mechanism, proven end to end on the
> two simplest, zero-argument actions. Where scope diverges from the map in the
> shared design doc, this spec wins; the shared doc is updated to match.
>
> **Two decisions were reversed during bring-up** (details in Key decisions
> below): the first slice was specced as a _single_ round-trip that did **not**
> persist tool calls, but hardware testing proved neither held. The model must
> **see its own prior tool calls replayed** in history or it drifts back to
> narrating actions instead of taking them (0/6 → 6/6 once replayed), and a
> **second round-trip** feeding the tool result back lets her react in words to
> what happened. The model is now **MiniMax M3** (chosen over M2 for far more
> reliable tool-calling); the original spike (§7) was run against M2 `:nitro`.

## What this phase is

The **action mechanism**. Until now the companion can only talk — the LLM
streams words and we speak them. This phase gives her **tools** to drive the
device, and executes them when she calls them. **Getting her to start the toy is
the first move of a session** (the device does not auto-start), which is why the
action mechanism lands before the proactive narration that rides on a running
program.

It wires exactly two tools — **`start`** and **`stop`** — end to end.

Whether she acts on your request or **declines** is a disposition written into
her `systemPrompt`, not a code gate — the code exposes and runs the tools; her
personality decides use.

### Key decisions (agreed)

- **Native function calling, not inline markers.** She expresses an action
  through the model's real `tool_calls` (the OpenAI-compatible `tools` request
  field), not a marker parsed out of her speech. Reliability matters for device
  actions. A spike against M2 `:nitro` (§7) confirmed the streamed delta shape;
  the model has since moved to **MiniMax M3**, which tool-calls far more
  reliably (6/6 vs. ~3/6 for M2 on the same prompt) and streams `tool_call`
  deltas in the same index-folded shape.
- **Tool calls ARE persisted and replayed (reversed).** The assistant's
  `tool_calls` and the `tool` results that answer them are committed to the
  rolling thread and **replayed to the model** as a valid agentic message
  sequence (assistant-with-`tool_calls` → `tool` result → spoken reaction). This
  is **load-bearing, not bookkeeping**: a model that only ever sees itself
  _talking_ in history (tool calls stripped) pattern-completes more talking and
  narrates "_starting_" instead of calling; replaying its own prior calls kept
  it reliably calling — **0/6 → 6/6** in bring-up. The spec originally chose
  _not_ to persist tool calls "because the model doesn't need to see its past
  calls"; hardware testing proved the opposite, so the conversation thread grew
  a `tool` turn (with `toolCallId`) and `toolCalls` on the assistant turn, and
  `toLlmMessages` now emits them instead of filtering them out. Legacy
  pre-agentic threads (tool turns without a `toolCallId`) are treated as
  malformed by the tolerant codec and reset cleanly.
- **Reacting second round-trip (reversed).** After the tool runs, its result is
  fed back for a **second LLM call** so she reacts in words to what actually
  happened ("Okay, it's on — starting you low…"). The original spec chose a
  single round-trip with no reaction; the reaction turned out to be a genuinely
  good feature and is cheap (the second call has no tools and is short). The
  ambient device-state line still carries the running status into _later_ turns
  independently, since the toy can be unplugged at any time.
- **Device state is ambient context, not a tool.** She always knows both the
  toy's **connection** and whether it's **running** because the current state is
  folded into her **system message every turn**, at a `{{TOY_STATUS}}` marker at
  the bottom of the prompt's CONTROL section (the last thing she reads) — there
  is **no `status` tool**. The wording is plain and avoids the in-app term
  "program" (the user doesn't know it): "The toy is connected and running." /
  "…connected and not running." / "…not connected and not running." This serves
  the goal (she can tell/remember if it's connected and running) with no extra
  round-trip and no chance of starting an already-running or disconnected toy,
  and it is the same current-state context the proactive-speech phase will carry
  on the thread — groundwork built early, not a throwaway.
- **Manual Start/Stop stay.** The existing `SessionControls` buttons remain
  alongside her tools — a fallback/debug lever while the tool path is proven.
  Both paths call the same `device.play()`/`device.pause()`, so state stays
  consistent. Making starting purely the companion's move (removing the manual
  Start) is a later polish, once tools are proven.
- **Aborted turns run no tool.** Barge-in / Stop that lands before the stream
  completes cancels the device action too — tools execute only after the same
  abort guard the assistant-turn commit already passes. "Cancelling the device
  action is always our code."

### Explicitly deferred

- **Companion-only start** (removing the manual Start button) — later polish.
- **Proactive narration + ambient talk** riding on the running program — the
  next phase, built on this control path.

## Design

### 1. A declarative `CompanionTool`, owned by the panel

The LLM analogue of the existing voice `Command` — declared by the panel (which
owns the device and engine), dispatched by the session (which stays
device-agnostic). Lives beside the other companion logic:

```ts
// src/lib/companions/tools.ts (pure types + request mapping)
export type CompanionTool = {
  name: string; // "start" | "stop"
  description: string; // shown to the model
  run: () => string; // executes the action; returns a short result string
};

// Map declared tools to the OpenAI-compatible request `tools` array.
export function toRequestTools(tools: CompanionTool[]): RequestTool[];
```

`start` and `stop` take **no arguments**, so each maps to a function tool with
an empty-object `parameters` schema. `run` returns a short result string that is
logged to the Events panel; the return type is there so a tool's outcome is
always surfaced, even though a device action's effect is also visible in the
next turn's ambient state.

### 2. LLM client — request `tools`, assemble `tool_calls`

`client.ts` `stream` gains, symmetric with how `reasoning_details` is handled:

- **Send side.** A new `tools?: RequestTool[]` in `opts`, passed straight into
  `chat.completions.create({ ..., tools })` when present. Omitted when empty, so
  a tool-less turn is byte-for-byte what it is today.
- **Read side.** Accumulate streamed `tool_call` deltas the same way reasoning
  is merged — fold by `index`, appending each call's `function.arguments` and
  taking `id` / `function.name` as they arrive — and surface the assembled calls
  **once at natural completion** via a new callback:

  ```ts
  opts: {
    signal;
    tools?;
    onUsage?;
    onReasoning?;
    onToolCalls?: (calls: ToolCall[]) => void; // ToolCall = { id; name; arguments: string }
  }
  ```

  Like `onReasoning`, `onToolCalls` **does not fire on an early break**
  (barge-in / abort calls the generator's `return()` and skips it), so a
  half-streamed tool call is never handed back. The `openai` SDK's streamed
  delta type doesn't model everything we read, so this is the same narrow
  local-augmented-type cast at the boundary already used for `reasoning_details`
  — never `any` on the whole call.

The client stays model-agnostic: it forwards whatever `tools` it's given and
surfaces whatever `tool_calls` come back; the panel decides what the tools _are_
and what they _do_.

### 3. Turn flow in `use-voice-session.ts` — reacting round-trip

`useVoiceSession` gains inputs from the panel:

```ts
useVoiceSession({
  tools: CompanionTool[];        // the start/stop declarations
  getDeviceState: () => string;  // live ambient-state line, read at turn-time
  onToolRun: (name, result) => void; // log each dispatch to the Events panel
})
```

`submitText` runs a two-call agentic loop:

- **Call 1 — offer the tools.** Build the request with `toRequestTools(tools)`
  passed to `llm.stream(..., { tools, onToolCalls })`, streaming her spoken
  `content` and capturing any assembled calls into a turn-local (like
  `reasoning` already is).
- **If she called a tool**, _inside the existing abort guard_
  (`aborted || turnRef.current !== controller`): **persist the agentic
  sequence** — an assistant turn carrying her `tool_calls` (and Call-1
  reasoning), then a `tool` turn per call linked by `toolCallId` — running each
  `tool.run()` in order and logging it via `onToolRun`. An aborted or superseded
  turn dispatches nothing.
- **Call 2 — react.** Rebuild the request from the just-persisted thread (which
  now holds the tool-call turn + results) with **no tools**, and stream her
  spoken reaction to the outcome. Rebuilding from the thread keeps the request
  and the stored history identical. This reaction becomes the committed
  assistant reply and the TTS text.
- **Commit + TTS** the reply exactly as before (spoken `content` + `reasoning`).
  When she called nothing, there is no Call 2 — it's a plain one-call turn.
- **Ambient state.** The per-turn system message is `ELISE.systemPrompt` with a
  `{{TOY_STATUS}}` marker replaced by the live `getDeviceState()` line, read at
  submit time (never persisted). `toLlmMessages` already takes the system prompt
  as an argument, so this is a marker-replace at the call site — no
  thread-module change.

An unknown tool name (model hallucination) is logged as `unknown tool`, never
thrown. A tool call with spoken Call-1 `content` of `""` is normal — the Call-2
reaction supplies her voice.

### 4. Ambient device-state line, from the panel

The panel already holds everything the line needs —
`player.state`/`player.source` and `vacuglide.connected`. It passes
`getDeviceState` reading those live. The line reports **two independent axes** —
the **connection** (is the toy linked to the app, i.e. what "is it on?" asks)
and whether it's **running** — since they are orthogonal (connected but stopped
is a normal state). It deliberately avoids the in-app term "program" (the user
doesn't know it):

- `The toy is connected and running.`
- `The toy is connected and not running.`
- `The toy is not connected and is not running.`

Wording is plain English so it reads naturally as context to the model. Elise's
prompt teaches her the two axes so she maps "on/connected" and "running/started"
correctly, and the marker sits at the end of her CONTROL section — the last, and
therefore most trusted, thing she reads.

### 5. Tool declaration + wiring in the panel

`companions-panel.tsx` declares the two tools from its existing device
transport, memoized so the array identity is stable:

```ts
const tools: CompanionTool[] = useMemo(
  () => [
    {
      name: "start",
      description: "…",
      run: () => {
        startProgram();
        return "started";
      },
    },
    {
      name: "stop",
      description: "…",
      run: () => {
        stopProgram();
        return "stopped";
      },
    },
  ],
  [startProgram, stopProgram],
);
```

and passes `tools` + `getDeviceState` (+ the event-log callback) into
`useVoiceSession`. `startProgram`/`stopProgram` already arm-if-needed and call
`device.play()`/`device.pause()`, so a tool-driven start behaves identically to
the manual button, and `SessionControls` mirrors the state either way. Each tool
dispatch appends to the existing **Events** log so the acceptance run shows her
actions.

### 6. Elise's prompt — she can start & stop

`elise-prompt.ts` gains a short section telling her she can **start and stop the
toy herself**, and _when_ — she decides in character (an eager companion starts
readily; a reluctant or domineering one may make you ask). It preserves the "no
command syntax, she just says it" voice already established for intensity: the
tool fires structurally while she speaks naturally. It also notes she is told
the device's current state, so she shouldn't start an already-running toy or
claim to start one that isn't connected.

### 7. The spike (first, throwaway)

Before building the above, a minimal spike confirms the one uncertain
assumption: wire a single `start` tool to M2 `:nitro` through the real proxy and
verify M2 (a) reliably emits the `tool_call` when asked to start, (b) streams
`tool_call` deltas in a shape the merge-by-`index` rule assembles, and (c) does
so cleanly alongside `content` and `reasoning_details` in one stream. If the
delta shape differs, the merge rule is adjusted before the full build — exactly
as the shared design doc anticipated ("possibly settled with a small spike
first").

### 8. Doc updates

- Shared design doc's phase entry already describes this; update only if scope
  shifts (e.g. `status` dropped in favour of ambient context is worth a line).
- `COMPANIONS.md` gains a short note that Elise can start/stop the device via
  tools and is told the live device state each turn.

## Testing

- **`tools.test.ts` (new, unit).** `toRequestTools` maps a `CompanionTool[]` to
  the request shape (name, description, empty-object parameters) and yields `[]`
  / omits for an empty input.
- **`client.test.ts` (update).** `onToolCalls` fires once with the assembled
  calls from streamed `tool_call` deltas (folded by `index`, arguments
  concatenated); a stream with no tool calls never fires it; an early break
  before completion does **not** fire it (mirrors the `onReasoning` abort test);
  `tools` is forwarded into the request when present and omitted when empty.
- **Typecheck / lint / build** stay green (zero-warning repo).
- **Manual bring-up** (the real gate): with the device connected, ask Elise to
  start — confirm the program runs, `SessionControls` flips to playing, and the
  Events log shows the `start`. Ask her to stop — confirm it pauses. Confirm she
  _knows_ both axes from context, without a tool call: ask "is it connected?"
  (connection) and "is it running?" (started/stopped) and check each answer
  tracks the real state. Barge-in / Stop mid-generation and confirm **no** tool
  fires and no partial turn commits. Confirm the manual buttons still work and
  stay in sync.

## Open items / notes

- **Tool-call delta shape** — confirmed against both M2 `:nitro` (spike, §7) and
  M3; both stream `tool_call` deltas in the same index-folded shape, and M3's
  `reasoning_details` deltas share the same `{type, text, index}` shape, so the
  reasoning-replay path is unchanged. Resolved.
- **Beat alignment** — the device acts as Call 1 completes (before the Call-2
  reaction and its TTS), slightly ahead of her spoken line. Whether that feels
  right (and whether to gate the action on TTS onset) is left to the
  proactive-speech / tuning phases.
- **M3 output formatting** — M3 writes denser prose than M2 (no paragraph breaks
  by default); a STYLE line in Elise's prompt restores burst-style paragraphs,
  and the transcript bubble trims leading/trailing whitespace.
- **Dangling user turns** from mid-generation cuts are unchanged from the
  conversation-thread phase and still accepted.
