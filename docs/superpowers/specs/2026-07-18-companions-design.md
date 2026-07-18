# Companions — Design & Context

> **Status:** design agreed, not yet implemented. This is the shared context for
> a long-running, multi-slice feature. It records **what we're building, how it
> works, and why we chose each path** — so any later slice's spec/plan can lean
> on it. Per-slice specs live beside this file; implementation plans live under
> `docs/superpowers/plans/`.

## Goal

A new algorithm in which a **persona-driven AI companion** rides on top of a
deterministic, Groove-style device program. The companion **narrates** the
device's moves, **chats** with you (and it can get explicit), and can **turn the
same knobs you can** — with the agency to decline. You talk to them hands-free;
they talk back with a real voice and can interrupt themselves the instant you
speak.

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
- The failure mode changes from **ruinous** (device stutters) to **forgiving** (a
  spoken line lands a beat late, or we skip it).
- It fits the existing engine architecture almost exactly (see below).

## How it works

### Persona

A companion is a **persona** — for v1 just a config object:

```json
{ name,
  gender,           // display-only, shown on the companion picker
  systemPrompt,     // their voice/character for the LLM
  voiceId,          // their ElevenLabs voice
  generationBias,   // the flavour of program they lay down
  initiative,       // how much they fill silence with talk
  agency }          // how readily they honor your control requests
```

`gender` is purely presentational — a label for the picker (e.g.
`female` / `male` / `nonbinary`). Everything a companion actually _is_ comes from
`systemPrompt` and `voiceId`; the field adds nothing to behaviour.

**Dominant/submissive is the high-level axis** that sets defaults across the
behavioural fields — and it is independent of `gender`. A dominant persona has
high initiative, low deference to your requests, and generates meaner programs
(deep plunges, jumpy timing); a submissive one is the inverse (waits for you,
eager to please, gentler programs). **v1 ships two personas — one dominant, one
submissive, of differing genders** — specifically to prove that personality bends
_both_ the chat _and_ the generated program (and that the dynamic is orthogonal to
gender), not just the words.

### Engine and program

A new **`CompanionEngine`** generates a **Groove-shaped program** — a schedule of
timed speed/valve events — flavoured by the persona's `generationBias`. It is
random within the persona's style but **deterministic once generated**. It owns
its own generation code rather than importing Groove's, consistent with the
project's convention that engines are self-contained (Goon deliberately
duplicates Groove's generation rather than sharing a module).

### Narration is a pure overlay

Groove already generates speed as a stateful backbone with valves as a **pure
overlay** laid across it (`generateValves`). Narration becomes a **third pure
overlay**: `generateNarrationCues` tags the timeline with _semantic_ events —
"speeding up", "deep dip approaching", "crawling at the bottom", "climbing back",
"stroke lengthening". The generator already knows a dip is deep vs. a gentle bob,
so it can mark _meaning_, not just raw numbers. Being an overlay, cues regenerate
with the future for free: change a knob → `invalidateFuture()` → the upcoming cues
re-lay along with the speed. The on-screen Sparkline already renders
`player.upcoming`; we're handing that same lookahead to the LLM.

### Orchestration: one thread, three speech sources

All speech comes off **one conversation thread** (shared rolling history +
current/upcoming device state), fed by three triggers:

1. **Program cues** — proactive narration, _prompted ahead_ of the event so TTS
   lands on the beat. Lowest priority (preemptible).
2. **User speech** — reactive; **barge-in**, highest priority (cuts them off, they
   respond).
3. **Ambient** — persona-`initiative`-gated sexy talk that fills silence. It is
   _pure conversation and never touches the program_. A dominant persona fills
   gaps; a submissive one waits.

### Control with agency

You can ask for changes by voice; **the companion decides whether to honor them**
(driven by `agency`). If they do act, it goes through the **same mechanisms Groove
already has** — `setSpeedPercent` (live), `invalidateFuture` (shape knobs), and the
stroke controls (`valvePlus`/`valveMinus`). They are not authoring raw device
events; they are a conversational hand on the existing knobs.

### Voice I/O and interruption

- **In:** ElevenLabs **realtime Speech-to-Text** over WebSocket, callable from the
  browser with a short-lived token. Chosen over Vosk for full dictation quality;
  Vosk is not built for open-ended transcription.
- **Out:** ElevenLabs **streaming TTS**, played through the browser (so the
  browser's echo canceller has the reference signal), with a hard stop handle so
  barge-in can cut mid-sentence. (The SDK's Node `play()` helper does not apply
  in-browser — we play the stream via Web Audio / `<audio>`.)
- **Barge-in** cancels three things at once via a **single `AbortController` per
  turn**: the in-flight LLM stream, the TTS playback, and any queued/in-flight
  **device action**. ElevenLabs stops the _speech_; cancelling the _device action_
  is always our code, in any architecture.
- **Echo / speakers.** With speakers rather than headphones, the companion's
  voice will hit the mic. Defenses, layered: explicit **AEC** via `getUserMedia`
  constraints (`echoCancellation`/`noiseSuppression`/`autoGainControl`); we know
  exactly what they said, so we can time-gate and text-match to reject echo; and we
  simply **don't stream to the remote STT while they're talking** (see cost below),
  so their voice never reaches the transcriber — only the _local_ barge-in VAD has
  to survive it.
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

Net: we only pay ElevenLabs for the seconds the user is actually dictating, and it
sidesteps the echo problem for free.

### LLM

Claude and OpenAI both restrict explicit adult content (OpenAI's "adult mode"
was floated in Oct 2025 and **paused indefinitely as of March 2026**), so neither
frontier API is viable here. We use a **self-hosted uncensored open-weight model
via Ollama** (self-hosted on a local machine; the app connects to it over the
LAN). Ollama exposes an **OpenAI-compatible streaming HTTP endpoint**.

- **Model: Cydonia 24B (v4.3), Q6_K** — TheDrummer's uncensored Mistral-Small
  finetune, Ollama tag `hf.co/bartowski/TheDrummer_Cydonia-24B-v4.3-GGUF:Q6_K`
  (MythoMax L2 13B, the original placeholder, is retired as outdated). Each
  companion is its own Ollama model card built on this shared base — see
  COMPANIONS.md. Swappable, not load-bearing.
- The app targets an **`LLMClient` over the OpenAI chat-completions shape**, so the
  backend (local Ollama now, a hosted permissive RP API later) is swappable config
  behind `LLM_URL` / `LLM_MODEL`.
- Calls go through a **Next API route** that forwards to `LLM_URL` (Ollama's
  endpoint) — same-origin for the browser (no CORS / `OLLAMA_ORIGINS` juggling),
  streaming passes straight through, and the host/model detail stays server-side.
  Streaming is abortable (close the fetch).

### Safety / KWS

Vosk keyword spotting is **reserved for the safeword** in this algorithm (reusing
the existing safe-word feature) → immediate stop. Whether the other global/nav
words stay live during a session is a per-slice detail.

### Secrets (public repo)

The repository is **public**, so no key is ever committed. `ELEVENLABS_API_KEY`
and the Ollama host live in **`.env.local`** (gitignored); a secret-free
`.env.example` is the committed template. All secret-bearing calls (STT token
minting, TTS, LLM proxy) run **server-side in Next API routes** — nothing is
`NEXT_PUBLIC_*`, so no secret reaches the browser bundle.

**Pre-deployment hardening (accepted risk, tracked here).** For the local
experiment these server routes are **intentionally unauthenticated** — there is
no user-accounts system yet, and the app runs locally on a single trusted
machine. This is a deliberate tradeoff for the local experiment — a
frontend-only, unauthenticated setup is knowingly insecure; authenticated user
accounts (to limit usage and charge users) come at deployment. Before
any public/multi-user deployment, the `stt-token` and `tts` routes (and the LLM
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
  **server-side** product: ElevenLabs connects _out_ to a public WebSocket server
  you run, hosts the whole voice loop, and only exchanges _text_ with you. That
  forces the LLM to the **server side — the opposite side from the device**, which
  lives in the browser (BLE, the one-Player invariant). Device commands would then
  have to be relayed server → browser, splitting the control loop. Rejected in
  favour of keeping the whole loop next to the device.
- **ElevenLabs Agents Platform (managed ConvAI).** Gives barge-in and `vad_score`
  for free, but it's opinionated and takes control of orchestration and device
  actions away from us. `vad_score`, notably, is a **client event** (ElevenLabs →
  browser), not something the Speech Engine _server_ sees — a distinction that
  confirmed how boxed-in the managed products are. Rejected for lack of control.
- **LLM authors raw device events / sits in the control loop.** Rejected via the
  core inversion above — latency vs. a realtime tick loop.
- **Claude / OpenAI for the chat.** Rejected: both restrict explicit content.

## Build order — four slices

Built as independently-shippable slices, each producing working, testable
software, rather than one monolithic plan. Slice 1 is first because it is the
**riskiest and most novel** part (echo-resistant barge-in on speakers, no
headphones); proving it de-risks everything else.

1. **Voice I/O foundation + algorithm shell.** Explicit AEC on the mic; ElevenLabs
   realtime STT in; ElevenLabs streaming TTS out (SDK server-side); local-VAD
   barge-in with pre-roll buffer; STT socket lifecycle (open on onset, close on
   silence); the single-`AbortController` interruption primitive. Hosted in a
   **real `Companions` algorithm shell** — an `ALGORITHMS` entry + panel + nav —
   so we iterate on the actual screen (pulled forward from Slice 4). The panel
   does not arm the Player yet. _Testable on its own:_ navigate to Companions,
   talk → get transcribed → hear a canned reply → interrupt it by speaking. No
   LLM, no device.

2. **LLM client.** The Next proxy route → Ollama, streaming + abort; the
   `LLMClient` over the OpenAI chat shape. _Testable standalone:_ send a prompt,
   get streamed, abortable tokens.

3. **CompanionEngine + narration overlay.** Groove-style generation flavoured by
   `generationBias`; `generateNarrationCues` overlay. _Unit-testable_ like the
   existing engine tests, no device/LLM.

4. **Integration.** The orchestration loop (three speech sources, one thread), the
   two personas, the panel + `ALGORITHMS` entry + navigation, and the safeword —
   wiring slices 1–3 into the actual algorithm.

## Deferred to per-slice specs

- Exact narration-cue vocabulary and how densely cues fire (chattiness).
- Prompt-ahead lead time and how TTS playback is scheduled against a cue's event
  time.
- Precise STT socket open/close thresholds and the VAD's attack debounce.
- Whether Vosk's global/nav words stay live mid-session, and exactly what the
  safeword tears down.
- Persona prompt content and the concrete `generationBias` → Groove-params mapping.
- Reconnect/error handling for the STT and TTS sockets.
