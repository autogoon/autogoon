# Companions — Phase 1: Voice I/O Foundation (Spec)

> Part of the Companions feature. Read
> [`2026-07-18-companions-design.md`](./2026-07-18-companions-design.md) first —
> this phase implements the **voice I/O foundation** (the riskiest, most novel
> piece: echo-resistant barge-in on speakers, no headphones), hosted in a **real
> `Companions` algorithm shell** so we iterate on the actual screen. No LLM, no
> device, no engine, no orchestration yet.

## Goal

Navigate to a real **Companions** screen and prove the full mouth-and-ears loop:
you speak → you're transcribed live by ElevenLabs → a **canned ~11 s reply** is
spoken back in Elise's voice → **you speak over it and it cuts within a beat**,
your first word intact. If that holds on speakers with no headphones, everything
downstream is de-risked.

## In scope

- A **`Companions` algorithm shell**: an `ALGORITHMS` entry (id `companions`), a
  `CompanionsPanel`, and home-chooser/nav wiring (so "companions" is a switch
  word). The panel **does not arm the Player** — it hosts the voice-lab UI only.
- Mic capture with **explicit AEC** (`echoCancellation` / `noiseSuppression` /
  `autoGainControl`).
- A **local energy VAD** (in an AudioWorklet) for onset + barge-in detection —
  no external VAD dependency.
- A **pre-roll ring buffer** (~500 ms) of AEC'd audio, always recording.
- **ElevenLabs realtime STT** over WebSocket, client-side via a single-use token
  minted server-side; opened on onset (flushing pre-roll), closed after silence.
- **ElevenLabs streaming TTS** via the **`@elevenlabs/elevenlabs-js` SDK
  server-side** (`textToSpeech.stream`), proxied to the browser; key stays off
  the client.
- The **single-`AbortController` interruption primitive**: one barge-in cancels
  TTS playback (and, in later phases, the LLM turn + device action).
- One minimal companion, **Elise**, used only for her voice.

## Explicitly out of scope (later phases)

- Any LLM call (the reply is canned) — Phase 2.
- Any device / engine / program / narration / arming the Player — Phase 3.
- The orchestration loop (three speech sources), the two personas, and the
  **safeword** — a later phase.
- **True mic-sharing with Vosk.** Vosk (global nav words) keeps running; the
  panel's voice session opens its **own** mic on a button. Reconciling one
  shared mic is a later phase; for now two consumers coexisting is acceptable.
- The full persona shape — Elise here carries only `name` / `gender` /
  `voiceId`.

## The companion for this phase

```ts
// src/lib/companions/companions.ts
export type Companion = {
  name: string;
  gender: "female" | "male" | "nonbinary";
  voiceId: string; // ElevenLabs voice id (not a secret — safe in code)
  // systemPrompt / generationBias / initiative / agency arrive in later phases.
};

export const ELISE: Companion = {
  name: "Elise",
  gender: "female",
  voiceId: "exHJXWRRhHzWYCoZrSF1",
};
```

Elise is an English-speaking Latvian e-girl; her accent lives in the ElevenLabs
voice itself, so the model only needs good English.

## External API decisions (pinned)

**STT — realtime, client-side:**

- Mint token (server):
  `POST https://api.elevenlabs.io/v1/single-use-token/realtime_scribe`, header
  `xi-api-key: $ELEVENLABS_API_KEY` — via the SDK if it exposes single-use
  tokens, else a direct `fetch`. Returns `{ token }`, single-use, 15-min expiry.
- Connect (browser):
  `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=<token>&audio_format=pcm_16000&commit_strategy=vad`.
- Send audio: `{ message_type: "input_audio_chunk", audio_base_64, commit }`.
- Receive: `session_started`, `partial_transcript`, `committed_transcript`. With
  `commit_strategy=vad`, **ElevenLabs' own server VAD decides end-of-turn** — so
  our local VAD only handles onset + barge-in.

**TTS — streaming, SDK server-side:**

- SDK call:
  `elevenlabs.textToSpeech.stream(ELISE.voiceId, { modelId: "eleven_v3", text, outputFormat: "mp3_44100_128" })`,
  which yields mp3 chunks. Our Next route pipes them straight to the browser.
- **Model `eleven_v3`** — the user's choice, most expressive. It streams fine on
  the HTTP output-streaming path (the _input-streaming WebSocket_ is the one
  that excludes v3; we don't use it for a canned string). v3's only cost is
  higher time-to-first-audio, which does **not** affect barge-in cut latency
  (stopping playback is instant). Swappable to `eleven_flash_v2_5` for snappy
  reactive replies in a later phase.

## Key safety (public repo)

- `ELEVENLABS_API_KEY` is read **only** in the two server routes below; never
  `NEXT_PUBLIC_`, never in the client bundle.
- Client → STT is direct over WSS but authorized by the **single-use token**.
- Client → TTS goes through **our proxy** (SDK runs server-side).

## Proposed module layout

- `src/app/api/stt-token/route.ts` — POST; mints the `realtime_scribe` token.
- `src/app/api/tts/route.ts` — POST `{ text, voiceId }`; streams SDK mp3 back.
- `public/companion-audio-worklet.js` — capture worklet: downsamples to 16 kHz
  PCM, computes a frame energy VAD, maintains the pre-roll ring buffer; posts
  `{ pcm16, rms, speaking }` frames.
- `src/lib/voice/mic.ts` — `getUserMedia` with AEC constraints, wires the
  worklet, exposes onset/quiet events + `flushPreRoll()`.
- `src/lib/voice/stt.ts` — STT socket lifecycle (token → connect → flush
  pre-roll → stream chunks → surface transcripts → close after 8 s quiet).
- `src/lib/voice/tts.ts` — fetch the proxied stream, play via MediaSource
  `<audio>`, `stop()` wired to an `AbortSignal`.
- `src/hooks/use-voice-session.ts` — orchestrator: onset → open STT; committed
  transcript → speak the canned reply; barge-in (onset while speaking) →
  `abort()`. One `AbortController` per companion turn.
- `src/components/algorithms/companions-panel.tsx` — the panel hosting the
  voice-lab UI (no Player arming).
- `src/app/page.tsx` — register the `companions` `ALGORITHMS` entry + render the
  panel (per the DEVELOPERS.md "adding an algorithm" checklist, minus the
  engine).

## Audio / interruption behaviour

- **Onset (local VAD, debounced ~100–150 ms)** → open STT, flush pre-roll so the
  opening word isn't clipped, go live.
- **End-of-turn** → server VAD commits → play canned reply through the browser.
- **Barge-in** = onset _while the reply is playing_ → the turn's
  `AbortController.abort()`: TTS stops immediately, a fresh STT turn opens with
  pre-roll flushed. Target cut latency **≤ ~250 ms**.
- **Echo defence** (speakers, no headphones): AEC on the mic; and we **do not
  stream to STT while the reply is playing** — only the local VAD watches during
  playback — so Elise's voice never reaches the transcriber. AEC's job is to
  keep her voice from _falsely tripping the local VAD_; a short attack debounce
  backs it up.
- **Cost lifecycle:** STT socket closes after **8 s** of quiet; reopens on next
  onset.

## The canned reply (~11 s, in Elise's voice)

> "Mmm, hi baby. I was starting to think you'd forgotten about me. Don't keep me
> waiting like that — you know I get restless. Come here and tell me what you've
> been thinking about."

(~33 words ≈ 11 s — long enough that barge-in has something substantial to cut.
Editable.)

## The Companions panel (the deliverable)

Reached via Home → Companions. The panel shows, live:

- **Mic** toggle (start/stop); AEC-on indicator.
- **VAD** state (quiet / speaking) + RMS meter.
- **STT socket** state (closed / connecting / open) + pre-roll ms buffered.
- **Transcript** — partial (greyed) rolling into committed lines.
- **Reply** indicator — playing / stopped, with elapsed seconds.
- **Event log** — onset → open → commit → play → barge-in → close, timestamped.

## Acceptance criteria (the manual test bar)

On speakers, **no headphones**:

1. Navigate to **Companions**, start mic, say a sentence → a **committed
   transcript** of it appears (real STT).
2. Elise's **~11 s canned reply plays** in her voice through the browser.
3. Speak over the reply → it **cuts within ~250 ms**, and your just-spoken words
   are transcribed with **no lost opening word** (pre-roll works).
4. Elise's own voice **never appears in the transcript** and **never falsely
   triggers barge-in** while you stay quiet (AEC + no-stream-during-TTS hold).
5. After ~8 s of silence the STT socket **closes** (visible in status) and
   **reopens** on the next onset.
6. `npm run typecheck`, `npm run lint`, `npm run build` clean.

## Resolved decisions

- Companion voice: Elise, `voiceId` `exHJXWRRhHzWYCoZrSF1` (in code).
- TTS: `eleven_v3` via SDK `textToSpeech.stream`, mp3 progressive playback.
- SDK: `@elevenlabs/elevenlabs-js` (installed), server-side only.
- Home: a real `companions` algorithm shell (not a throwaway route); panel hosts
  the voice-lab UI, no Player arming.
- Silence-close timeout: 8 s.
