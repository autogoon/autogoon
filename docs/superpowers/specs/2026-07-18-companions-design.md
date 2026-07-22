# Companions — Design & Context

> **Status:** partially shipped. Phases 1–5 and Phase 6's full tool set landed
> cumulatively: Phases 1–5, the `start`/`stop` tools, and a first
> `intensity`/`edge_control` pair merged to `main` in
> [#13](https://github.com/autogoon/autogoon/pull/13) — along with the LLM
> backend move to OpenRouter, barge-in tuning (word + energy gate), and a
> shared-secret demo access gate. On branch `companions-2` (PR link to be
> added), that pair was retooled into the shipped `intensity`/`variety` tools
> described below, completing Phase 6. The remaining work — Phases 7–12 —
> continues on `companions-2`. This is the shared context for a long-running,
> multi-phase feature. It records **what we're building, how it works, and why
> we chose each path** — so any later phase's spec/plan can lean on it.
> Per-phase specs live beside this file; implementation plans live under
> `docs/superpowers/plans/`.

## Goal

A new algorithm in which a **persona-driven AI companion** rides on top of a
deterministic, Groove-style device program. The companion **chats** with you
about it and about anything else (and it can get explicit), and can **turn the
same knobs you can** — and can refuse. You talk to them hands-free; they talk
back with a real voice and can interrupt themselves the instant you speak.

The feature is **gender-neutral by construction** — nothing structural is
gendered. A companion's presentation rides on its prompt and voice; `gender` is
carried only as a display attribute for the picker (see Persona).

## The core inversion (the idea everything hangs on)

The obvious design puts the LLM _inside_ the control loop: the LLM decides what
the device does, moment to moment. That fails on latency — an LLM is seconds
slow and async, and the device tick loop is realtime, so the model's lag
threatens to stutter the hardware.

**We flip it.** The program is generated up front (Groove-style, deterministic,
smooth) and drives the device on its own. The LLM is a **passenger** that reads
the already-known current and upcoming state of the program and _talks about
it_ — on its own cadence (ambient chat, below), not pinned to a per-event lead
time.

Why this is the whole game:

- The device **never waits** on the LLM. Motion quality is decoupled from model
  latency entirely.
- The failure mode changes from **ruinous** (device stutters) to **forgiving**
  (a spoken line lands a little late, or we skip it).
- It fits the existing engine architecture almost exactly (see below).

## How it works

### Persona

A companion is a **persona** — a config object:

```json
{ name,
  gender,           // display-only, shown on the companion picker
  voiceId,          // their ElevenLabs voice
  systemPrompt,     // their voice/character for the LLM
  model,            // OpenRouter model slug
  contextWindow,    // model context window, in tokens
  passesReasoning,  // replay the model's reasoning in history (reasoning models)
  traits }          // the four 1–5 behavioural axes below
```

`gender` is purely presentational — a label for the picker (e.g. `female` /
`male` / `nonbinary`). Everything a companion actually _is_ comes from
`systemPrompt`, `voiceId`, and `traits`; the field adds nothing to behaviour.

**A companion's behaviour is a blend of four granular traits** (each scored
1–5), not a single dominant/submissive dial — the axes are independent, so every
combination is a real personality (a calm, controlling dom is high `dominance`
but low `variety`; a bratty tease is high on both). Each trait shows up in
_both_ channels: how she **talks** (shaped into the `systemPrompt`) and what she
does to the **toy** (read by the engine / her tools):

| Trait (1–5)    | Low → High             | In the chat (prompt)                              | On the toy (code)                                                                                            |
| -------------- | ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **dominance**  | follows ↔ takes charge | asks / eager-to-please ↔ commands, denies, teases | how often she drives the toy _unprompted_, and whether she complies or refuses when you ask (tools + prompt) |
| **intensity**  | gentle ↔ rough         | tender ↔ filthy / aggressive                      | Groove's speed-percent magnitude — how high the peak (and everything scaled off it) runs                     |
| **chattiness** | quiet ↔ vocal          | sparse ↔ constant dirty-talk / commentary         | the ambient-chat _cue interval_ — how often she pokes herself to speak (a cadence, not a per-tick gate)      |
| **variety**    | steady ↔ restless      | —                                                 | Groove's timing + dip-variability knobs — how much leg length and floor depth wander cycle to cycle          |

Whether she does what you ask is a disposition **written into her
`systemPrompt`** (and exercised through Phase 6's tools), not something the code
branches on. **Responsiveness** — how much she reacts to _your_ moans /
barge-ins vs. does her own thing — is a likely **future** trait, deferred until
her behaviour actually hooks into your vocal cues (Phases 6/7); until then it
reads as `dominance`.

The traits arrive with the phases that first consume them (`chattiness` in Phase
7, `intensity` + `variety` in Phase 11, `dominance` across the prompt and Phase
6's tools), not all at once. **v1's end goal is two contrasting personas** —
proving personality bends _both_ the chat _and_ the generated program, not just
the words — delivered when the second companion lands (Phase 12).

### Engine and program

A new **`CompanionEngine`** is a self-contained port of **Groove's dip
generation**: a repeating cycle of `PEAK → floor → PEAK`, with a live
**speed-percent magnitude** knob (the peak everything scales against) and
**timing** / **dip-variability** shape knobs that draw how deep each floor goes
and how long each leg takes. It owns its own generation code rather than
importing Groove's, consistent with the project's convention that engines are
self-contained (Goon duplicates Groove's generation the same way). One
companion-only addition on top: a one-shot stroke-minus tease held for the
first few seconds of a session, ported from Goon's start-of-run tease.

Groove is the base because it's the pattern Goon already auto-drives and it
has no fixed template shape to fight — a continuous dip cycle that a live knob
can reshape stroke by stroke, exactly what a persona-driven engine needs; there
is no discrete "mini-program" boundary at all. The persona shaping the program
lands in **Phase 11**: the engine reads her `intensity` and `variety` traits
(and `dominance` decides when _she_ changes things) and maps them onto
**Groove's own knobs** — `intensity` to the speed-percent magnitude, `variety`
to the timing/dip-variability knobs. Until then — Phase 3 through Phase 10 —
generation runs on a fixed default knob config, so **the program is truly
random within its style, not yet persona-shaped**.

### Ambient chat

Narration and "ambient" filler were only ever separated by their trigger — a
template boundary vs. silence. Groove has no boundaries, so there's no
boundary event left to hang narration on: the two collapse into **one**
proactive speech source, **ambient chat**.

Ambient chat is a self-poke on a **time cadence set by the persona's
`chattiness`** — every _x_ ± _y_ seconds; the exact timing shape is a Phase 7
detail. Chattiness **is** the cadence, not a per-tick gate: every interval
fires a poke, and a chattier persona simply has a shorter interval between
pokes.

A cue carries **no payload** — no template label, no semantic hint. It's a
bare "take a turn now" trigger. What she actually says comes from the device
state already folded into her system message every turn, plus the
`player.upcoming` speed lookahead (the same lookahead the on-screen Sparkline
already renders) — she reads the live/upcoming program and decides what's
worth saying about it.

The cue generation **stays on `CompanionEngine`** — it was never part of the
`AlgorithmEngine` contract, so nothing "moves out of the engine"; only its
timing basis (a chattiness cadence, not a boundary) and its payload (none, not
a label) change. It's built in **Phase 7**, once a `chattiness` knob and an
orchestrator consumer exist to fire on it. The old boundary-based
`generateNarrationCues` is removed now — Groove has no template boundaries for
it to fire on.

A poke can end in a **tool call** — she may change the program mid-poke, not
just talk about it — so ambient chat is not "pure conversation that never
touches the program."

### Orchestration: one thread, two speech sources

All speech comes off **one conversation thread** (shared rolling history +
current/upcoming device state), fed by two triggers:

1. **User speech** — reactive; **barge-in**, highest priority (cuts them off,
   they respond).
2. **Ambient chat** — proactive, paced by `chattiness`; preemptible by
   barge-in at any time. A chatty persona fills gaps more often; a quiet one
   waits longer between pokes.

### Control

You can ask for changes by voice; **the companion decides whether to honor
them** — a disposition written into her `systemPrompt`, not a code gate. If she
does act, it goes through **tools**, as shipped: `start`, `stop`, `intensity`
(a live percent, applied every tick) and `variety` (a level that reshapes the
generated pattern). Manual stroke (`valvePlus`/`valveMinus`) is an **on-screen
control only** — it is not offered to the LLM as a tool. She is not authoring
raw device events; she is a conversational hand on the existing knobs.

**Starting is the companion's move (Phase 6).** The device program does **not**
auto-start. The user opens a session by starting to listen and talking to the
companion; the timeline and the device only begin moving when the _companion_
decides to start play — starting is itself one of the companion's actions, not a
user button. The same prompt-driven disposition applies here: an eager companion
starts readily, while a reluctant or domineering one may need persuading before
it will begin. (Phase 1 has no device, so this lands in the later phases.)

### Voice I/O and interruption

- **In:** ElevenLabs **realtime Speech-to-Text** over WebSocket, callable from
  the browser with a short-lived token. Chosen over Vosk for full dictation
  quality; Vosk is not built for open-ended transcription.
- **Out:** ElevenLabs **streaming TTS**, played through the browser (so the
  browser's echo canceller has the reference signal), with a hard stop handle so
  barge-in can cut mid-sentence. (The SDK's Node `play()` helper does not apply
  in-browser — we play the stream via Web Audio / `<audio>`.)
- **Barge-in** cancels three things at once via a **single `AbortController` per
  turn**: the in-flight LLM stream, the TTS playback, and any queued/in-flight
  **device action**. ElevenLabs stops the _speech_; cancelling the _device
  action_ is always our code, in any architecture.
- **Echo / speakers.** With speakers rather than headphones, the companion's
  voice will hit the mic. Defenses, layered: explicit **AEC** via `getUserMedia`
  constraints (`echoCancellation`/`noiseSuppression`/`autoGainControl`); we know
  exactly what they said, so we can time-gate and text-match to reject echo; and
  we simply **don't stream to the remote STT while they're talking** (see cost
  below), so their voice never reaches the transcriber — only the _local_
  barge-in VAD has to survive it.
- **Losing the user's opening word.** Opening the STT socket has latency, so we
  keep a **pre-roll ring buffer** (~500 ms) of AEC'd mic audio always recording;
  on barge-in we flush the pre-roll into the socket first, then go live. The
  latency is hidden because we were already recording.

### Cost lifecycle

ElevenLabs realtime STT bills per connected minute. So:

- While the companion speaks / during silence, the remote STT socket is
  **closed**. A cheap, local, always-on **VAD** (energy-based / WebRTC VAD,
  possibly leaning on Vosk) watches the AEC'd mic purely to answer "has the user
  started talking?"
- On user onset → barge-in → open STT → flush pre-roll → stream the real
  dictation → **close again after N seconds of silence.**

Net: we only pay ElevenLabs for the seconds the user is actually dictating, and
it sidesteps the echo problem for free.

### LLM

Claude and OpenAI both restrict explicit adult content (OpenAI's "adult mode"
was floated in Oct 2025 and **paused indefinitely as of March 2026**), so
neither frontier API is viable here. We use **OpenRouter**, an OpenAI-compatible
hosted proxy that fronts a wide range of models — no self-hosting, no LAN
Ollama box. OpenRouter itself doesn't restrict content; that's a property of
whichever model a companion picks.

- **Elise's model: `minimax/minimax-m3`** — an OpenRouter model slug, permissive
  enough for her persona's roleplay and (per COMPANIONS.md) markedly more
  reliable at calling device tools than its predecessor, M2. Each `Companion`
  carries its own `model` slug and `contextWindow` (Elise: 1,000,000 tokens) —
  swappable per companion, not load-bearing on this specific model.
- The persona lives in the `Companion` config as a client-side `systemPrompt`,
  sent as the LLM's `system` message every turn — there is no server-side model
  card (the deleted Ollama Modelfile's job moved into code).
- The app targets an **`LLMClient` over the OpenAI chat-completions shape**, so
  the backend is swappable config behind `LLM_URL` (OpenRouter's endpoint).
  There is no `LLM_MODEL` — model selection is per-companion, not global.
- Calls go through a **Next API route** (`/api/llm`) that forwards to
  `LLM_URL` and injects `OPENROUTER_API_KEY` server-side as a Bearer header —
  same-origin for the browser (no CORS juggling), streaming passes straight
  through, and the key never reaches the client. Streaming is abortable (close
  the fetch).

### Safety / KWS

As shipped, the Companions panel registers **no vosk words at all** — open
dictation to the companion would otherwise transcribe them, so even the manual
stroke controls are buttons-only with no voice badges. The intended design —
Vosk keyword spotting **reserved for the safeword** (reusing the existing
safe-word feature) for an immediate hard stop — is **not built**; that's Phase
8's job, including whether any global/nav words stay live during a session.

### Secrets (public repo)

The repository is **public**, so no key is ever committed. `ELEVENLABS_API_KEY`
and `OPENROUTER_API_KEY` live in **`.env`** (gitignored); a secret-free
`.env.example` is the committed template. All secret-bearing calls (STT token
minting, TTS, LLM proxy) run **server-side in Next API routes** — nothing is
`NEXT_PUBLIC_*`, so no secret reaches the browser bundle.

**Pre-deployment hardening (accepted risk, tracked here).** For the local
experiment these server routes are **intentionally unauthenticated** — there is
no user-accounts system yet, and the app runs locally on a single trusted
machine. This is a deliberate tradeoff for the local experiment — a
frontend-only, unauthenticated setup is knowingly insecure; authenticated user
accounts (to limit usage and charge users) come at deployment. Before any
public/multi-user deployment, the `stt-token` and `tts` routes (and the LLM
proxy) **must** gain: an authenticated session check (401 when absent) and
per-user rate limiting, so a stranger or compromised account cannot mint tokens
or burn the ElevenLabs/LLM quota. The `tts` route additionally needs input
bounds — restrict `voiceId` to a server-side allowlist (only known companion
voices) and cap `text` length per request — so it can't be turned into an
open-ended TTS proxy. Automated security review correctly and repeatedly flags
these routes (unauthenticated token minting; unauthenticated TTS proxy / quota
abuse); every item here is knowingly deferred for the local experiment, not
overlooked.

## Alternatives considered and rejected

- **ElevenLabs "Speech Engine" SDK (reverse WebSocket).** Purpose-built for
  BYO-LLM, and its managed turn-taking is genuinely nice — but it is a
  **server-side** product: ElevenLabs connects _out_ to a public WebSocket
  server you run, hosts the whole voice loop, and only exchanges _text_ with
  you. That forces the LLM to the **server side — the opposite side from the
  device**, which lives in the browser (BLE, the one-Player invariant). Device
  commands would then have to be relayed server → browser, splitting the control
  loop. Rejected in favour of keeping the whole loop next to the device.
- **ElevenLabs Agents Platform (managed ConvAI).** Gives barge-in and
  `vad_score` for free, but it's opinionated and takes control of orchestration
  and device actions away from us. `vad_score`, notably, is a **client event**
  (ElevenLabs → browser), not something the Speech Engine _server_ sees — a
  distinction that confirmed how boxed-in the managed products are. Rejected for
  lack of control.
- **LLM authors raw device events / sits in the control loop.** Rejected via the
  core inversion above — latency vs. a realtime tick loop.
- **Claude / OpenAI for the chat.** Rejected: both restrict explicit content.
- **Autopilot's template blocks as the engine base, with narration anchored to
  template boundaries.** The original design; disliked in hardware testing (the
  Autopilot pattern itself, not the narration idea) and replaced with a port of
  **Groove's** dip generation — the manual pattern Goon already auto-drives,
  and one with no fixed template shape to fight a live knob. Losing the
  boundary took the boundary-anchored narration cue with it; it was replaced by
  a single **ambient-chat** cue paced by the persona's `chattiness`, not by
  where a template happens to end.

## Build order — twelve phases

Built as independently-shippable **phases**, each producing working, testable
software, rather than one monolithic plan. **Phases 1–3** build the isolated
components (voice I/O, LLM client, engine) that touch nothing else; **Phases
4–12** wire them into a working algorithm and flesh it out. Phase 1 is first
because it is the **riskiest and most novel** part (echo-resistant barge-in on
speakers, no headphones); proving it de-risks everything else. From Phase 4 on
the order is **dependency-forced, not risk-first**: the action mechanism
(Phase 6) needs Phase 4's armed Player and Phase 5's persisted conversation
thread, and it comes _before_ ambient chat (Phase 7) — getting the companion
to **start the toy** is the first move of a session, and only a running,
companion-driven program gives ambient chat's pokes something to describe.
Each phase gets its own spec/plan when we reach it; only the map is fixed here.

1. **Voice I/O foundation + algorithm shell.** Explicit AEC on the mic;
   ElevenLabs realtime STT in; ElevenLabs streaming TTS out (SDK server-side);
   local-VAD barge-in with pre-roll buffer; STT socket lifecycle (open on onset,
   close on silence); the single-`AbortController` interruption primitive.
   Hosted in a **real `Companions` algorithm shell** — an `ALGORITHMS` entry +
   panel + nav — so we iterate on the actual screen (pulled forward from a later
   phase). The panel does not arm the Player yet. _Testable on its own:_
   navigate to Companions, talk → get transcribed → hear a canned reply →
   interrupt it by speaking. No LLM, no device.

2. **LLM client.** The Next proxy route → Ollama, streaming + abort; the
   `LLMClient` over the OpenAI chat shape. _Testable standalone:_ send a prompt,
   get streamed, abortable tokens.

3. **CompanionEngine (as built).** A self-contained port of Groove's dip
   generation (`PEAK → floor → PEAK`) with a speed-percent magnitude knob and
   timing/dip-variability shape knobs, plus a one-shot start-of-session
   stroke-minus tease. No narration/ambient-chat overlay yet — the cue
   mechanism needs a `chattiness` knob and an orchestrator consumer, both of
   which land in Phase 7. Plain port — the persona → program mapping
   (`traits`) deferred to Phase 11. _Unit-testable_ like the existing engine
   tests, no device/LLM.

4. **Device integration + OpenRouter (as built).** The panel arms the one Player
   with a `CompanionEngine`, so picking Elise and entering
   `Home › Companions › Play` runs _her_ program on the device while she talks:
   a minimal one-companion picker, a live Sparkline, temporary on-screen
   Intensity / Edge / Vacuum knobs + manual stroke, and a **separate manual
   device Start**. Elise's persona feeds the LLM as a client-side `systemPrompt`
   (the deleted Ollama Modelfile's job), and the backend moved from local Ollama
   to **OpenRouter** (OpenAI-compatible) — a server-side bearer key, the model
   sent per-companion. Each `Companion` carries `model` + `contextWindow`. Plus
   a debug **Latency** readout and a device Command log. _Ships:_ pick Elise →
   the device runs a program and she talks like herself. (One companion; a
   **random** program on a fixed default knob config; exposed-but-temporary
   knobs; buttons-only device controls — no vosk grammar; the `traits` model,
   the persona → program mapping, and the companion-decides-to-start move all
   land in later phases.)

5. **Conversation thread + persistence.** Give the companion memory: keep the
   full rolling history (user + assistant turns) and pass it back to the LLM on
   every turn, instead of the stateless single-message turns Phase 4 shipped.
   Persist the thread to `localStorage` so it survives reloads, and add a
   **Clear conversation** control that empties it. **No context-window culling
   yet** — the thread is allowed to grow unbounded; keeping it within the
   model's window is Phase 9's job. _Ships:_ Elise remembers what was said
   earlier in the session and across a reload; Clear wipes the slate.
   **Reasoning preservation:** MiniMax M3 (Elise's model) is a reasoning model —
   it returns a private "thinking" block (`reasoning_details` on OpenRouter)
   alongside the visible reply, and it was trained with that reasoning present
   in the history, so stripping it measurably degrades later turns. So this
   phase must capture `reasoning_details` from the stream (the client currently
   keeps only content), store it on each assistant turn, and pass it back
   verbatim (sequence preserved) in the assistant messages. This is
   model-specific, so it's gated by a per-companion **`passesReasoning`** flag
   (Elise = `true`); companions on non-reasoning models leave it off. (Same
   pattern applies to DeepSeek / Kimi thinking modes to varying degrees; MiniMax
   is the emphatic case.)

6. **Tools & control (as shipped).** The action mechanism — the app gives her
   **tools** to drive the device (`start`, `stop`, `intensity`, `variety`) and
   executes them when she calls them; `start` becomes the companion's move.
   **Getting the companion to start the toy is the first step** of a session,
   which is why the action mechanism lands before the ambient chat that rides
   on the running program. Whether she acts on your request or
   **declines** is a disposition written into her `systemPrompt` — the code
   exposes and runs the tools; her personality decides use. The first slice
   wired the two zero-argument actions — **`start` and `stop`** — end to end;
   `intensity` (a live percent) and `variety` (a level that reshapes the
   generated pattern) followed on the same mechanism. **Resolved (the open
   question was native tool-calls vs. markers):** she expresses actions through
   **native tool-calls** (the OpenAI-compatible `tools` field), not markers
   parsed from her speech. Two findings from bring-up proved load-bearing and
   are now part of the design: (a) the assistant's `tool_calls` and their
   results must be **persisted to the thread and replayed** as a proper agentic
   message sequence — a companion that only ever sees itself _talking_ (tool
   calls stripped from history) drifts back to narrating "_starting_" instead
   of calling; replaying its own prior calls kept it reliably calling (0/6 →
   6/6 in bring-up testing); and (b) after a call runs, its result is fed back
   for a **second round-trip** so she reacts in words to what actually
   happened. The live toy state (connection + whether it's running, plus its
   current intensity/variety) is folded into her system message every turn as
   ambient context — there is **no `status` tool**. Manual stroke
   (`valvePlus`/`valveMinus`) shipped as an **on-screen control only**, never
   offered to the LLM as a tool. _Ships:_ ask her to start / stop / get more
   intense / mix it up more — she decides in character and the device follows,
   or she refuses.

7. **Ambient chat.** Built on Phase 5's thread and Phase 6's companion-driven
   control. A single self-poking cue generator lands on `CompanionEngine`,
   fired on a cadence set by a new **`chattiness`** trait (introduced here) —
   every _x_ ± _y_ seconds, no per-event trigger. The cue carries no payload;
   the orchestrator consumes it and the persona decides what to say from the
   thread's current + upcoming device state (`player.upcoming`), free to end
   the turn in a tool call. Preemptible under barge-in like any proactive
   speech. _Ships:_ she speaks up unprompted at a pace that matches her
   chattiness, grounded in what the toy is actually doing.

8. **Safeword + barge-in tuning.** Vosk KWS reserved for the safeword →
   immediate hard stop that also **tears down the voice session (LLM + TTS)**,
   not just `Player.pause()`; the nav/global-word lockdown a running session
   needs; and reconciling the two concurrent mic captures (vosk for the safeword
   vs. ElevenLabs STT for conversation). Plus the deferred barge-in tuning:
   barge-in is too aggressive. _Ships:_ say the safeword → everything stops
   instantly; the loop feels right on hardware.

9. **Context compaction / rolling window.** Keep Phase 5's ever-growing thread
   within the model's context window (recorded per companion as `contextWindow`
   in Phase 4 — Elise's MiniMax M3 is 1,000,000). That window is large enough
   that overflow is a distant concern; this phase is headroom for very long
   sessions and cost control rather than a near-term limit. Summarize older
   turns and/or keep a rolling window of recent turns verbatim, so long sessions
   stay coherent without overflowing the window or ballooning cost. When
   `passesReasoning` is on, old turns' `reasoning_details` are trimmed along
   with the messages they belong to — keeping the recent turns' reasoning intact
   is what matters. _Ships:_ an hours-long session keeps working; the companion
   still remembers the gist of earlier context.

10. **Turn-commit review, reply-length tuning & prompt polish.** With the loop
    running on hardware, tune the conversational feel: revisit the
    interrupted-turn commit rule (the user turn is committed immediately, the
    assistant turn only on generation-complete, which can leave a dangling user
    turn when a mid-generation barge-in cuts a reply before it finishes) —
    confirm it feels right or adjust; keep replies short enough for TTS latency;
    and a review/polish pass over Elise's system prompt. _Ships:_ the
    conversation feels natural — short replies, sensible memory after
    interruptions, Elise on-character.

11. **Persona shapes Elise's program.** Give Elise her `traits` (`dominance` /
    `intensity` / `chattiness` / `variety`, 1–5) and map the code-facing ones
    onto **Groove's** knobs — `intensity` sets the speed-percent magnitude,
    `variety` sets the timing/dip-variability level; `dominance` gates how
    often _she_ changes it unprompted. Her program stops being random and
    becomes **hers**. Still one companion — this is the persona → program
    mechanism working end-to-end before a second persona exists to contrast
    against. _Ships:_ Elise's program visibly reflects her character instead
    of being generic-random.

12. **Contrasting companion.** Add a second companion with contrasting `traits`
    and prompt, turning the one-entry picker into a real multi-companion
    chooser. This is where the **end goal** finally lands: two personalities you
    can compare, proving character bends _both_ the chat _and_ the generated
    program — a rough, domineering one lays down a meaner, more restless program
    and talks like it; a gentle, eager one the inverse. _Ships:_ pick between
    two genuinely different companions and feel the difference in both her words
    and the device.

## Deferred to per-phase specs

- The ambient-chat cadence itself — the exact _x_ ± _y_ seconds derived from
  `chattiness` (Phase 7).
- Precise STT socket open/close thresholds and the VAD's attack debounce
  (barge-in tuning: Phase 8).
- Whether Vosk's global/nav words stay live mid-session, and exactly what the
  safeword tears down (Phase 8).
- The concrete `traits` → Groove-knob mapping (Phase 11); a second persona's
  prompt + trait content (Phase 12).
- Reconnect/error handling for the STT and TTS sockets.
