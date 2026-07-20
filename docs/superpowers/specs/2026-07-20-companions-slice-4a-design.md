# Companions — Slice 4a: Integration (device + OpenRouter)

> **Status:** design agreed, not yet implemented. Builds on
> [companions-design.md](./2026-07-18-companions-design.md) (the shared context)
> and the completed slices 1–3. This spec covers **4a only**. Where 4a's scope
> diverges from the map in the shared design doc, this spec wins; the shared doc
> is updated to match.

## What 4a is

The first integration slice: wire slices 1–3 into a working session where **the
device actually runs a program while Elise talks to you**, and swap the LLM
backend from local Ollama to **OpenRouter**. Concretely, 4a ships two tracks:

1. **Device + nav integration.** The Companions panel arms the one Player with a
   `CompanionEngine`, so picking Elise and entering Play runs *her* program on
   the hardware. Adds the `Home › Companions › Play` sub-level, a minimal
   one-companion picker, on-screen program-shape knobs, and a manual device
   `start`.
2. **LLM → OpenRouter.** Replace the Ollama proxy target with OpenRouter
   (OpenAI-compatible), authenticated with a server-side key. The persona moves
   out of the (now-deleted) Ollama model card and into the `Companion` config as
   a client-side system message. Each companion gains a `model` and
   `contextWindow`.

Both tracks land in one slice because the user confirmed the OpenRouter change is
small and there is no value in a throwaway intermediate step.

### Scope decisions (agreed)

- **One companion.** Only Elise this slice. The two-persona goal (proving
  personality bends the program) and a real multi-entry picker are deferred until
  companion #2 is added. The picker is built as structure but lists only Elise.
- **The program stays random.** `CompanionEngine` already chooses templates with
  `Math.random`; the `generationBias → knobs` mapping remains deferred. 4a arms
  the engine with a **fixed default knob config** and lets template randomness
  supply the variety.
- **Knobs are exposed — temporarily.** The program-shape controls
  (intensity / edge / suction) render as on-screen segmented controls this slice
  so the program is tunable during bring-up. **They are transitional:** the
  end-state is that *the LLM turns these knobs itself via tools* (the action
  mechanism from 4c onward), at which point the manual controls are hidden. This
  is recorded so we don't mistake the temporary UI for the intended design.
- **Device controls are buttons only — no vosk command words.** Companions runs
  open dictation to Elise over ElevenLabs STT, so a spoken keyword like "start"
  would both fire a command *and* be transcribed into her chat. The two-mic
  reconciliation (vosk keyword-spotting vs. ElevenLabs STT) is explicitly 4d
  work. Until then, Companions registers **no** algorithm words; every device
  control is an on-screen button, and vosk carries only the existing global words
  (`connect` / `exit` / the safeword). This is a deliberate, documented departure
  from the project's "give every control a word" convention, justified by the
  dictation interaction model.

### Explicitly deferred (unchanged from the shared design)

- **Narration & ambient speech → 4b.** In 4a the device program and Elise's chat
  are two parallel tracks: the program plays deterministically; she chats
  reactively as she does today. She does **not** narrate the moves yet. The
  shared conversation thread (rolling history) also arrives in 4b — turns in 4a
  stay stateless (a single user message), so **conversation pruning is not needed
  yet**; 4a only *records* each companion's `contextWindow` for 4b to use.
- **Agency / the action mechanism → 4c.** Elise cannot trigger device actions in
  4a. `start` is a manual button (the "companion decides to start" move is 4c).
  Because there is no LLM-triggered device action yet, barge-in only needs to
  cancel the LLM stream + TTS (already implemented); there is nothing new for it
  to cancel.
- **Safeword teardown & nav lockdown → 4d.** In 4a the existing global safeword
  already pauses the Player (the device stops), which is now meaningful because
  the Player actually runs. It does **not** yet tear down the voice session
  (LLM + TTS) — that hardening, plus the two-mic reconciliation, is 4d.

## Design

### 1. Navigation & picker

Companions gains a setup/play sub-level exactly like Goon. The `Screen` type in
`page.tsx` already models `${AlgorithmId}/play`, and the breadcrumb / nav-lock /
popstate handling is already generic over any algorithm with a `/play` level — so
this is a rendering change, not new nav machinery:

- **Setup level (`#companions`):** the minimal picker. Shows Elise (name, a line
  of character, her accent colour) and a **Begin** control that navigates to
  `companions/play`. Structured as a list so companion #2 slots in later; lists
  one entry now.
- **Play level (`#companions/play`):** the live session — the conversation card
  (existing), the device session controls, the sparkline, and the temporary knob
  cards.

`page.tsx` renders `<CompanionsPanel>` with the same prop shape the other
device-arming panels get: `vacuglide`, `player`, `active` (true when
`screenBase === "companions"`), `view` (`"setup"` | `"play"` from
`atPlayLevel`), and `onEnterPlay`. The running-session nav lock (can't leave
mid-session, breadcrumb disabled while the Player is non-idle) then applies to
Companions for free, because `running = player.state !== "armed"` already gates
it and the Player is now armed with a `CompanionEngine`.

### 2. Panel restructure

`CompanionsPanel` becomes a device-arming panel *and* keeps its voice session. It
owns a `CompanionEngine` in a `useRef` and follows Autopilot's arming pattern:

- `engineRef.current ??= new CompanionEngine(DEFAULT_INTENSITY, DEFAULT_EDGE, DEFAULT_SUCTION)`.
- An effect arms the engine when `active && player.state === "armed" && player.source !== engine`.
- `start` / `stop` / `reset` drive `device.arm/play/pause` (Autopilot's shape).
- The knob handlers (`changeIntensity` / `changeEdge` / `changeSuction`) mirror
  Autopilot's: intensity & edge call `device.invalidateFuture()` (they reshape the
  generated script); suction calls `device.invalidateValves()` (valve-only
  overlay).

The **voice session** (`useVoiceSession`) stays as-is structurally — the panel
still hosts the `<audio>` element, the Start/Stop-listening button, the RMS meter,
and the Conversation card. The two concerns coexist in one panel: the mic session
is unchanged; the device session is added alongside.

**View split.** Rather than a `companions-panel/` directory this slice, the panel
renders its setup content when `view === "setup"` and its play content when
`view === "play"`, both inside the always-mounted component (the panel must stay
mounted so the single `useVoiceSession` mic hook is called exactly once, as its
existing comment requires). The setup view is the picker + Begin; the play view is
the session UI.

Play-view furniture (mirrors the other panels, **buttons only**):

- `SessionControls` (Start / Stop / Reset) for the **device program**.
- `Sparkline` over `player.upcoming.speed` / `.valves` — the lookahead, already
  rendered by the other panels.
- `StrokeCard` (manual valve ±) via `useStrokeControls` for its button state; its
  `keywords` are **not** wired to voice this slice (no vosk words in Companions).
- Three temporary knob cards: Intensity, Edge Control, Vacuum Maintenance
  (Autopilot's controls), each flagged in a comment as transitional (to become
  LLM-driven tools).
- No `useVoiceCommands` call — Companions registers no algorithm words in 4a.

### 3. Device start — separate & manual

"Start listening" (mic on, converse with Elise) and "Start" (begin the device
program) are **distinct controls**. The mic session opens the conversation; the
device program is started separately by the manual Start button. This mirrors the
eventual flow — you talk first, and later (4c) *Elise* decides to begin the
device — so 4c only has to swap the manual trigger for her decision, not
re-separate two coupled things.

`start` arms the engine if needed and calls `device.play()`; `stop` calls
`device.pause()`; `reset` restores default knobs and re-arms. Standard Player
transport, identical to Autopilot.

### 4. Engine arming — fixed defaults, random program

The engine is armed with a fixed default knob config (proposed:
`intensity: "medium"`, `edge: "moderate"`, `suction: "little"` — a moderate
baseline; tune during bring-up). Template selection inside `CompanionEngine` is
already random, so successive blocks vary without any `generationBias` input. The
`generationBias → knobs` mapping stays deferred; when it lands (with companion
#2), it will set these knobs from the persona instead of a constant.

### 5. LLM backend → OpenRouter

OpenRouter is OpenAI-compatible, so the client SDK and streaming path are
unchanged. The changes:

**Environment** (`.env.local`, gitignored; `.env.example` updated with
secret-free placeholders + comments):

- `LLM_URL=https://openrouter.ai/api/v1`
- `OPENROUTER_API_KEY=<the sk-or-… key>` — **server-side only**, never committed.
- `LLM_MODEL` is **removed** — the model is now per-companion (see config), sent
  from the client. (Documented shift: the old "keep the model off the client"
  nicety was Ollama-era; OpenRouter model slugs aren't secret, and a
  multi-companion picker with differing models *must* let the client name the
  model. Only the **API key** stays server-side.)

**Proxy route** (`src/app/api/llm/chat/completions/route.ts`):

- Read `OPENROUTER_API_KEY`; return 503 if `LLM_URL` or the key is missing.
- Add `Authorization: Bearer ${OPENROUTER_API_KEY}` to the upstream fetch.
- Optionally add OpenRouter's `HTTP-Referer` / `X-Title` attribution headers
  (nice-to-have for their dashboard; not required).
- **Stop overriding `body.model`** — trust the model the client sends (it comes
  from the companion's config). Everything else (streaming passthrough, abort via
  `request.signal`, error mapping) is unchanged.
- The route remains intentionally unauthenticated for the local experiment, per
  the shared design's "Pre-deployment hardening" note — now doubly relevant since
  it fronts a *paid* OpenRouter key. The hardening items (auth check, rate limit)
  are unchanged and still deferred; the comment is updated to name OpenRouter.

**LLM client** (`src/lib/llm/client.ts`): `createLlmClient` takes the companion's
`model` (instead of the placeholder constant) and sends it. The persona is passed
as a **system message** prepended to each turn's messages — see the session below.

**Persona as a system message.** `useVoiceSession` / `submitText` prepends
`{ role: "system", content: companion.systemPrompt }` before the user message on
every turn. With no Ollama card, this is what makes Elise sound like herself.

### 6. Companion config

`src/lib/companions/companions.ts` — the `Companion` type gains three fields:

```ts
export type Companion = {
  name: string;
  gender: "female" | "male" | "nonbinary"; // display-only (picker)
  voiceId: string;        // ElevenLabs voice id (not a secret)
  systemPrompt: string;   // persona; sent as the LLM system message
  model: string;          // OpenRouter model slug, e.g. "minimax/minimax-m2:nitro"
  contextWindow: number;  // model's context window in tokens; recorded for
                          // conversation pruning in 4b (unused in 4a)
  // generationBias / initiative / agency still arrive in later slices.
};
```

Elise is populated with:

- `systemPrompt`: her full persona, lifted verbatim from the `SYSTEM """…"""`
  block of the deleted `elise.Modelfile`. To keep `companions.ts` readable, the
  long prompt text lives in a sibling module (e.g.
  `src/lib/companions/elise-prompt.ts`) and is imported.
- `model`: `"minimax/minimax-m2:nitro"`.
- `contextWindow`: `196608` — the conservative window. MiniMax M2 is 204,800
  nominal, but `:nitro` may route to a ~196,608 provider, so we record the
  smaller guaranteed value; 4b's pruning is then safe whichever provider serves
  the turn. (Unused in 4a — recorded for 4b.)

**Deletions / doc updates:** `elise.Modelfile` is deleted. `COMPANIONS.md` is
rewritten to describe the OpenRouter model (persona in code, per-companion
`model` + `contextWindow`, the `OPENROUTER_API_KEY` secret) instead of the Ollama
card-per-companion setup. The shared design doc's LLM and Secrets sections get a
note that the backend is OpenRouter as of 4a; the deeper rewrite of that section's
rationale can follow.

### 7. Barge-in & safeword (interim)

- **Barge-in** is unchanged — it cancels the LLM stream + TTS via the single
  per-turn `AbortController`. No device action exists for it to cancel in 4a.
- **Safeword** uses the existing global path (`page.tsx` routes it to
  `player.pause()`), which now stops the running `CompanionEngine`. It does not
  yet tear down the voice session — deferred to 4d.

## Testing

Consistent with the repo's approach (unit tests for pure logic; the app is
hardware-driven, so behaviour is verified by driving it):

- **Unit / route test.** Update `src/app/api/llm/chat/completions/route.test.ts`
  for the new behaviour: sends `Authorization: Bearer` from the env key; forwards
  the client's `model` without overriding it; 503 when the key or `LLM_URL` is
  absent. No live OpenRouter call.
- **Engine.** `CompanionEngine` is already unit-tested; 4a doesn't change it.
- **Typecheck / lint / build** stay green (zero-warning repo).
- **Manual bring-up** (the real gate): pick Elise → Begin → Play; press Start and
  confirm the device runs a program (sparkline advances, hardware moves if
  connected); talk to Elise and confirm she replies over OpenRouter in her voice;
  barge in and confirm she stops; adjust a knob and confirm the future
  regenerates; say the safeword and confirm the device stops.

## Open items / notes

- **Rotate the OpenRouter key.** It was shared in plaintext during design; rotate
  it on OpenRouter once wiring is verified. It only ever lives in `.env.local`.
- **`:nitro` context spread.** MiniMax M2 is 204,800 tokens nominal, but nitro
  routing may hit a ~196,608 provider, so `contextWindow` records the
  conservative 196,608. Recorded for 4b's pruning, not acted on in 4a.
- **Temporary knobs.** The Intensity / Edge / Suction controls are placeholder UI
  for bring-up; they are slated to become LLM-driven tools and be hidden from the
  user (4c onward).
```
