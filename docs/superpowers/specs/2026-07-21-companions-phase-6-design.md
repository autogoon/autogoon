# Companions — Phase 6: Tools & control (start & stop)

> **Status:** design agreed, not yet implemented. Builds on
> [companions-design.md](./2026-07-18-companions-design.md) (the shared context)
> and the completed conversation-thread + persistence work. This spec covers the
> **`start` and `stop` tools** — the action mechanism, proven end to end on the
> two simplest, zero-argument actions. Where scope diverges from the map in the
> shared design doc, this spec wins; the shared doc is updated to match.

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
  actions, and MiniMax M2 is a tool-use-oriented model. The one uncertain part —
  that M2 `:nitro` streams `tool_call` deltas cleanly alongside its `content`
  and `reasoning_details` — is de-risked with a **small spike first** (below).
- **Single round-trip.** A turn executes tool calls as a side effect after the
  stream completes; there is **no** second LLM call to let her react to a tool
  result. `start`/`stop` don't need a verbal reaction to their result — the
  **ambient device-state context** (next decision) carries the outcome into the
  next turn. She can return spoken `content` **and** a tool call in the same
  turn ("Mm, let's get you going" + `start`), so there is no added latency.
- **Device state is ambient context, not a tool.** She always knows both the
  toy's **connection** and whether the **program** is running because the
  current state is folded into her **system message every turn** — there is **no
  `status` tool**. This serves the goal (she can tell/remember if it's connected
  and if it's running) with zero round-trips and no chance of her starting an
  already-running toy, and it is exactly the current+upcoming device state the
  proactive-speech phase already plans to carry on the thread — groundwork built
  early, not a throwaway.
- **Tool calls are not persisted.** Only spoken `content` (+
  `reasoning_details`) is committed to the rolling thread, exactly as now. The
  persisted history stays clean `user`/`assistant` content — no `tool` role
  messages, no `tool_calls` on stored turns — so every conversation-thread
  invariant (reasoning replay, tolerant codec) holds untouched. The model
  doesn't need to see its past calls; the ambient state line tells it the
  current running status.
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
- **A verbal reaction to a tool result** (a second round-trip) is not built;
  `start`/`stop` don't need it.

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

### 3. Turn flow in `use-voice-session.ts` — single round-trip

`useVoiceSession` gains two inputs from the panel:

```ts
useVoiceSession({
  tools: CompanionTool[];        // the start/stop declarations
  getDeviceState: () => string;  // live ambient-state line, read at turn-time
})
```

`submitText` changes minimally:

- **Build the request** with `toRequestTools(tools)` passed through to
  `llm.stream(..., { tools, onToolCalls })`, capturing the assembled calls into
  a turn-local like `reasoning` already is.
- **After the stream completes**, _inside the existing abort guard_
  (`aborted || turnRef.current !== controller`) — the same guard that gates the
  assistant-turn commit — **dispatch** each returned call to the matching
  `tool.run()`, in order, and log each to the panel's event log via a callback.
  An aborted or superseded turn dispatches nothing.
- **Commit the assistant turn** (spoken `content` + `reasoning`) and **TTS** the
  content exactly as now. Tool dispatch happens _before_ TTS resolves, so the
  device acts roughly as she speaks (fine-tuning the beat is a later phase).
- **Ambient state.** Build the per-turn system message as
  `ELISE.systemPrompt + "\n\n" + getDeviceState()`, read live at submit time
  (never persisted). `toLlmMessages` already takes the system prompt as an
  argument, so this is a one-line change at the call site — no thread-module
  change.

An unknown tool name (model hallucination) is ignored and logged, never thrown.
A tool call returned with spoken `content` of `""` simply acts silently — valid
and rare.

### 4. Ambient device-state line, from the panel

The panel already holds everything the line needs — `player.state` (via the
`isCurrent` check) and `vacuglide.connected`. It passes `getDeviceState` reading
those live. The line reports **two independent axes**, always both — the
**connection** (is the toy linked to the app, i.e. what "is it on?" asks) and
the **program** (running/started vs stopped) — since they are orthogonal
(connected but stopped is a normal state):

- `Device state: the toy is connected to the app; the program is running.`
- `Device state: the toy is connected to the app; the program is stopped.`
- `Device state: the toy is not connected to the app; the program is stopped.`
  (and the `not connected` + `running` combination if the program is playing
  while the link is down)

Wording is plain English so it reads naturally as context to the model; the
exact phrasing is settled during bring-up against how M2 reacts. Elise's prompt
teaches her the two axes so she maps "on/connected" and "running/started"
correctly.

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

- **Tool-call delta shape** against live M2 `:nitro` output — confirm in the
  spike and adjust the merge rule if the streamed shape differs (see §7).
- **Beat alignment** — the device acts as the stream completes, slightly ahead
  of TTS first-audio. Whether that feels right (and whether to gate the action
  on TTS onset) is left to the proactive-speech / tuning phases.
- **Dangling user turns** from mid-generation cuts are unchanged from the
  conversation-thread phase and still accepted.
