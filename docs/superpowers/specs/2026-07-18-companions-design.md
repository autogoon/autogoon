# Companions — Design & Context

> **Status:** design agreed, not yet implemented. This is the shared context for
> a long-running, multi-phase feature. It records **what we're building, how it
> works, and why we chose each path** — so any later phase's spec/plan can lean
> on it. Per-phase specs live beside this file; implementation plans live under
> `docs/superpowers/plans/`.

## Goal

A new algorithm in which a **persona-driven AI companion** rides on top of a
deterministic, Groove-style device program. The companion **narrates** the
device's moves, **chats** with you (and it can get explicit), and can **turn the
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
the already-known future of the program and _talks about it_. Because the future
is known ahead of time, we **prompt the LLM ahead** of an upcoming event so the
synthesized speech lands on the beat.

Why this is the whole game:

- The device **never waits** on the LLM. Motion quality is decoupled from model
  latency entirely.
- The failure mode changes from **ruinous** (device stutters) to **forgiving**
  (a spoken line lands a beat late, or we skip it).
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
| **intensity**  | gentle ↔ rough         | tender ↔ filthy / aggressive                      | soft, slow, smooth program ↔ hard, fast, big abrupt swings                                                   |
| **chattiness** | quiet ↔ vocal          | sparse ↔ constant dirty-talk / narration          | ambient-talk _cadence_ — how often she speaks into a silence                                                 |
| **variety**    | steady ↔ restless      | —                                                 | segment length / how often the pattern mixes up before she changes it                                        |

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

A new **`CompanionEngine`** generates an **Autopilot-shaped program** — a
schedule of timed speed/valve events built by concatenating Autopilot's discrete
**template "mini-programs"** into blocks. It is random within its style but
**deterministic once generated**. It owns its own generation code rather than
importing Autopilot's, consistent with the project's convention that engines are
self-contained (Goon deliberately duplicates Groove's generation rather than
sharing a module).

Autopilot's template blocks — rather than a bespoke Groove-style generator — are
the base because each template is a discrete, recognisable pattern with a clear
**boundary** where the next one begins: exactly the hook narration needs
(below). The persona shaping the program lands in **Phase 11**: the engine reads
her `intensity` and `variety` traits (and `dominance` decides when _she_ changes
things) and maps them onto Autopilot's own knobs. Until then — Phase 3 through
Phase 10 — generation runs on a fixed default knob config with random template
selection, so **the program is truly random within its style, not yet
persona-shaped**.

### Narration is a pure overlay

The engine generates speed as a backbone with valves as a **pure overlay** laid
across it (`generateValves`). Narration becomes a **third overlay**:
`generateNarrationCues` fires one cue at **every template boundary** — the
moment the program switches to the next mini-program — carrying that template's
**neutral semantic label** (e.g. "slamming between dead slow and full tilt",
"teasing climbs, each one higher", "a long slow sweep up and back down"). Each
template in the table is authored with its label, so a cue marks _meaning_, not
raw numbers; the label is persona-agnostic — the persona _voices_ it in Phase 7.
Cues regenerate with the future for free: change a knob → `invalidateFuture()` →
the upcoming cues re-lay along with the speed. The on-screen Sparkline already
renders `player.upcoming`; we're handing that same lookahead to the LLM.

### Orchestration: one thread, three speech sources

All speech comes off **one conversation thread** (shared rolling history +
current/upcoming device state), fed by three triggers:

1. **Program cues** — proactive narration, _prompted ahead_ of the event so TTS
   lands on the beat. Lowest priority (preemptible).
2. **User speech** — reactive; **barge-in**, highest priority (cuts them off,
   they respond).
3. **Ambient** — persona-`chattiness`-gated sexy talk that fills silence. It is
   _pure conversation and never touches the program_. A chatty persona fills
   gaps; a quiet one waits.

### Control

You can ask for changes by voice; **the companion decides whether to honor
them** — a disposition written into her `systemPrompt`, not a code gate. If she
does act, it goes through **tools** wired to the **same mechanisms Groove
already has** — `setSpeedPercent` (live), `invalidateFuture` (shape knobs), and
the stroke controls (`valvePlus`/`valveMinus`). She is not authoring raw device
events; she is a conversational hand on the existing knobs.

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

> As of Phase 4 the backend is **OpenRouter** (OpenAI-compatible), not
> self-hosted Ollama; the persona lives in the `Companion` config as a
> client-side system message, and each companion carries its own `model` +
> `contextWindow`. The rationale below (why not Claude/OpenAI, why an
> OpenAI-compatible chat shape) still holds — only the hosting changed. See
> COMPANIONS.md for the current setup.

Claude and OpenAI both restrict explicit adult content (OpenAI's "adult mode"
was floated in Oct 2025 and **paused indefinitely as of March 2026**), so
neither frontier API is viable here. We use a **self-hosted uncensored
open-weight model via Ollama** (self-hosted on a local machine; the app connects
to it over the LAN). Ollama exposes an **OpenAI-compatible streaming HTTP
endpoint**.

- **Model: Cydonia 24B (v4.3), Q6_K** — TheDrummer's uncensored Mistral-Small
  finetune, Ollama tag `hf.co/bartowski/TheDrummer_Cydonia-24B-v4.3-GGUF:Q6_K`
  (MythoMax L2 13B, the original placeholder, is retired as outdated). Each
  companion is its own Ollama model card built on this shared base — see
  COMPANIONS.md. Swappable, not load-bearing.
- The app targets an **`LLMClient` over the OpenAI chat-completions shape**, so
  the backend (local Ollama now, a hosted permissive RP API later) is swappable
  config behind `LLM_URL` / `LLM_MODEL`.
- Calls go through a **Next API route** that forwards to `LLM_URL` (Ollama's
  endpoint) — same-origin for the browser (no CORS / `OLLAMA_ORIGINS` juggling),
  streaming passes straight through, and the host/model detail stays
  server-side. Streaming is abortable (close the fetch).

### Safety / KWS

Vosk keyword spotting is **reserved for the safeword** in this algorithm
(reusing the existing safe-word feature) → immediate stop. Whether the other
global/nav words stay live during a session is a per-slice detail.

### Secrets (public repo)

The repository is **public**, so no key is ever committed. `ELEVENLABS_API_KEY`
and the Ollama host live in **`.env`** (gitignored); a secret-free
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

## Build order — twelve phases

Built as independently-shippable **phases**, each producing working, testable
software, rather than one monolithic plan. **Phases 1–3** build the isolated
components (voice I/O, LLM client, engine) that touch nothing else; **Phases
4–12** wire them into a working algorithm and flesh it out. Phase 1 is first
because it is the **riskiest and most novel** part (echo-resistant barge-in on
speakers, no headphones); proving it de-risks everything else. From Phase 4 on
the order is **dependency-forced, not risk-first**: the action mechanism
(Phase 6) needs Phase 4's armed Player and Phase 5's persisted conversation
thread, and it comes _before_ proactive speech (Phase 7) — getting the companion
to **start the toy** is the first move of a session, and only a running,
companion-driven program gives the narration cues something to describe on the
beat. Each phase gets its own spec/plan when we reach it; only the map is fixed
here.

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

3. **CompanionEngine + narration overlay.** A self-contained port of Autopilot's
   template-block generation, plus a `generateNarrationCues` overlay firing a
   cue at each template boundary (each template labelled with a neutral semantic
   description). Plain port + labels — the persona → program mapping (`traits`)
   deferred to Phase 11. _Unit-testable_ like the existing engine tests, no
   device/LLM.

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
   **Reasoning preservation:** MiniMax M2 (Elise's model) is a reasoning model —
   it returns a private "thinking" block (`reasoning_details` on OpenRouter)
   alongside the visible reply, and it was trained with that reasoning present
   in the history, so stripping it measurably degrades later turns. So this
   phase must capture `reasoning_details` from the stream (the client currently
   keeps only content), store it on each assistant turn, and pass it back
   verbatim (sequence preserved) in the assistant messages. This is
   model-specific, so it's gated by a per-companion **`passesReasoning`** flag
   (Elise = `true`); companions on non-reasoning models leave it off. (Same
   pattern applies to DeepSeek / Kimi thinking modes to varying degrees; M2 is
   the emphatic case.)

6. **Tools & control.** The action mechanism — the app gives her **tools** to
   drive the device (`setSpeedPercent`, `invalidateFuture`, valve controls, and
   `start`) and executes them when she calls them; `start` becomes the
   companion's move. **Getting the companion to start the toy is the first
   step** of a session, which is why the action mechanism lands before the
   proactive narration that rides on the running program. Whether she acts on
   your request or **declines** is a disposition written into her `systemPrompt`
   — the code exposes and runs the tools; her personality decides use. **Open
   question, resolved when we spec this phase:** how the LLM expresses an action
   reliably through the model — native tool-calls vs. structured markers parsed
   from the stream — possibly settled with a small spike first. _Ships:_ ask her
   to start / speed up / edge you — she decides in character and the device
   follows, or she refuses.

7. **Proactive speech: narration + ambient.** Built on Phase 5's thread and
   Phase 6's companion-driven control. The thread carries current + upcoming
   device state; `generateNarrationCues` consumed by the orchestrator and
   _prompted ahead_ so the synthesized speech lands on the beat; the persona
   voices each neutral cue label; ambient filler talk whose cadence is gated by
   her **`chattiness`** trait (introduced here). Both proactive sources are
   preemptible under barge-in. _Ships:_ she narrates the moves in character, on
   the beat, and fills silences to her chattiness.

8. **Safeword + barge-in tuning.** Vosk KWS reserved for the safeword →
   immediate hard stop that also **tears down the voice session (LLM + TTS)**,
   not just `Player.pause()`; the nav/global-word lockdown a running session
   needs; and reconciling the two concurrent mic captures (vosk for the safeword
   vs. ElevenLabs STT for conversation). Plus the deferred barge-in tuning:
   barge-in is too aggressive. _Ships:_ say the safeword → everything stops
   instantly; the loop feels right on hardware.

9. **Context compaction / rolling window.** Keep Phase 5's ever-growing thread
   within the model's context window (recorded per companion as `contextWindow`
   in Phase 4 — Elise's MiniMax M2 is 196,608). Summarize older turns and/or
   keep a rolling window of recent turns verbatim, so long sessions stay
   coherent without overflowing the window or ballooning cost. When
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
    onto the engine's knobs — `intensity` and `variety` set the program's
    softness and restlessness; `dominance` gates how often _she_ changes it
    unprompted. Her program stops being random and becomes **hers**. Still one
    companion — this is the persona → program mechanism working end-to-end
    before a second persona exists to contrast against. _Ships:_ Elise's program
    visibly reflects her character instead of being generic-random.

12. **Contrasting companion.** Add a second companion with contrasting `traits`
    and prompt, turning the one-entry picker into a real multi-companion
    chooser. This is where the **end goal** finally lands: two personalities you
    can compare, proving character bends _both_ the chat _and_ the generated
    program — a rough, domineering one lays down a meaner, more restless program
    and talks like it; a gentle, eager one the inverse. _Ships:_ pick between
    two genuinely different companions and feel the difference in both her words
    and the device.

## Deferred to per-phase specs

- The exact label wording per template (authored in Phase 3's template table).
  Cadence is settled: one cue per template boundary.
- Prompt-ahead lead time and how TTS playback is scheduled against a cue's event
  time (Phase 7).
- Precise STT socket open/close thresholds and the VAD's attack debounce
  (barge-in tuning: Phase 8).
- Whether Vosk's global/nav words stay live mid-session, and exactly what the
  safeword tears down (Phase 8).
- The concrete `traits` → Autopilot-params mapping (Phase 11); a second
  persona's prompt + trait content (Phase 12).
- Reconnect/error handling for the STT and TTS sockets.
