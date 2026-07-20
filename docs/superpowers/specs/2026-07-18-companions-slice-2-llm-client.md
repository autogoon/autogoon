# Companions — Slice 2: LLM Client (Spec)

> Part of the Companions feature. Read
> [`2026-07-18-companions-design.md`](./2026-07-18-companions-design.md) first —
> this slice adds the **LLM client**: a same-origin proxy route to Ollama and an
> `LLMClient` over the OpenAI chat-completions shape (streaming + abort). It is
> consumed in two places — a decoupled **LLM lab** in the Companions panel, and
> the **voice loop** from Slice 1, where a streamed LLM reply now **replaces the
> canned reply**. No engine/device, no orchestration thread, no personas yet.

## Goal

Talk to the companion and get a **real, model-generated reply spoken back**.
Two provable surfaces:

1. **LLM lab** (decoupled): type a prompt → watch tokens **stream** in → press
   **Stop** and the stream **aborts** mid-flight.
2. **Voice loop** (wired): speak → you're transcribed (Slice 1 STT) → the
   transcript goes to the LLM → the **full reply is buffered, then spoken** in
   Elise's voice (Slice 1 TTS) → **barge-in cuts the reply** as before, now also
   cancelling the in-flight LLM turn.

## In scope

- A **Next proxy route** — `src/app/api/llm/chat/completions/route.ts` — that
  forwards an OpenAI chat-completions request to `LLM_URL` (Ollama), **injecting
  `LLM_MODEL` server-side**, and pipes the streamed response straight back.
  Abortable (closing the client fetch aborts the upstream fetch).
- An **`LLMClient`** — `src/lib/llm/client.ts` — built on the **`openai` SDK**
  pointed at the same-origin proxy, exposing a streaming, abortable
  `stream(messages, { signal })` that yields token deltas.
- An **LLM lab** section in `companions-panel.tsx`: prompt input, Send, live
  streamed output, Stop (abort). Its own `AbortController`; **decoupled** from the
  mic session.
- **Voice wiring** in `use-voice-session.ts`: the committed transcript drives the
  LLM; the **full reply is buffered** then handed to the existing TTS path. The
  turn's **single `AbortController`** now cancels the LLM stream **and** TTS, so
  barge-in kills both.
- Add the **`openai`** dependency.

## Explicitly out of scope (later slices)

- **Persona system prompt.** For now the persona/system prompt lives **in the
  Ollama model card** (server-side, per `LLM_MODEL`); the client sends only the
  **user turn**. The `Persona.systemPrompt` field and picking a card per companion
  arrive in Slice 4.
- **Rolling conversation thread / history.** Single-shot per transcript this
  slice — each turn sends just `[{ role: "user", content: transcript }]`. The
  shared rolling history (design: "one thread, three speech sources") is Slice 4.
- **Sentence-streaming into TTS.** The reply is buffered to one string and spoken
  as a single utterance (exactly like Slice 1's canned reply). Sentence-chunked
  streaming into a TTS queue is Slice 4 orchestration.
- **Per-companion model selection.** One `LLM_MODEL` for now; the route overrides
  any client-sent model with it. Choosing a card per companion is Slice 4.
- **Reconnect / retry** for the stream (design defers this per-slice).
- Any **engine / device / program / narration** — Slice 3.

## External API decisions (pinned)

**Proxy route — `POST /api/llm/chat/completions`:**

- Path is chosen so the `openai` SDK's `baseURL: "/api/llm"` appends
  `/chat/completions` to reach it.
- `runtime = "nodejs"`. Reads `LLM_URL` and `LLM_MODEL`; **503** if either is
  unset (matching the `stt-token` / `tts` routes).
- Parses the incoming JSON body, **sets `model` to `LLM_MODEL`** (overriding
  whatever the client sent — design: "the host/model detail stays server-side"),
  and `fetch`es `` `${LLM_URL}/chat/completions` `` with the re-serialized body,
  `method: "POST"`, `content-type: application/json`, forwarding
  `request.signal` so a client abort tears down the upstream call.
- On success, returns `new Response(upstream.body, …)` with
  `content-type: text/event-stream` — the SSE stream passes through untouched.
- On upstream failure (non-OK, or `fetch` throws because Ollama is down) →
  a JSON error with an appropriate status, surfaced to the client.

**Client — `openai` SDK, browser-side:**

- `new OpenAI({ baseURL: "/api/llm", apiKey: "unused", dangerouslyAllowBrowser: true })`.
  The proxy is unauthenticated for the local experiment, so the key is a
  throwaway; `dangerouslyAllowBrowser` is required because the SDK blocks
  in-browser use by default.
- `client.chat.completions.create({ model, messages, stream: true }, { signal })`;
  the client-sent `model` is a placeholder (the route overrides it). Iterate the
  stream, yielding `chunk.choices[0]?.delta?.content` when present. The `signal`
  makes the whole turn abortable.

## Key safety (public repo)

- `LLM_URL` / `LLM_MODEL` (and the Ollama host they point at) are read **only** in
  the proxy route, server-side; never `NEXT_PUBLIC_`, never in the client bundle.
- The route is **intentionally unauthenticated** for the local experiment — same
  knowingly-deferred tradeoff as `stt-token` / `tts`, tracked in the design's
  "Pre-deployment hardening" section. Automated security review will flag it
  (unauthenticated LLM proxy / quota abuse); that is expected and accepted here.

## Proposed module layout

- `src/app/api/llm/chat/completions/route.ts` — the proxy: env → model-override →
  forward to Ollama → stream back. Abortable.
- `src/lib/llm/client.ts` — `createLlmClient()` → `{ stream(messages, { signal }) }`
  over the `openai` SDK; yields token deltas.
- `src/components/algorithms/companions-panel.tsx` — add an **LLM lab** `Card`
  (prompt input, Send, streamed output, Stop), using the client directly.
- `src/hooks/use-voice-session.ts` — swap the canned reply for the buffered LLM
  reply; fold the LLM stream into the turn's existing `AbortController`.

## Behaviour

- **LLM lab.** Send → open a fresh `AbortController`, stream deltas, append each to
  the on-screen output. Stop → `abort()`; the stream ends promptly. A second Send
  aborts any prior in-flight stream first.
- **Voice reply.** On committed transcript → `stream([{ role:"user", content:
  transcript }], { signal: turn.signal })`, **accumulate the full text**, then call
  the existing TTS with it. Time-to-first-audio is higher than the canned reply
  (we wait for the whole generation) — accepted; barge-in latency is unaffected
  (stopping playback is still instant).
- **Barge-in.** Onset while the reply is playing → the turn's `abort()` now
  cancels **both** the LLM stream (if still generating) **and** TTS playback, and a
  fresh STT turn opens with pre-roll flushed — same primitive as Slice 1, one more
  thing hanging off the one controller.
- **LLM error (e.g. Ollama down).** Lab: show the error. Voice: log/skip — no
  reply is spoken, the session stays usable. (Reconnect/retry is out of scope.)

## Testing

- **Route unit test** (`route.test.ts`, node env, mocked `fetch`): forwards to
  `` `${LLM_URL}/chat/completions` ``; **overrides `model` with `LLM_MODEL`**
  regardless of the client-sent model; passes the streamed body through; **503**
  when `LLM_URL` or `LLM_MODEL` is unset; forwards the abort signal.
- **Client unit test** (`client.test.ts`): over a mocked `OpenAI`, a fake stream of
  chunks yields the expected concatenated deltas, and skips chunks with no
  `delta.content`.
- **Manual (the bar).**
  1. **LLM lab:** type a prompt → tokens stream in → **Stop** aborts mid-stream.
  2. **Voice:** speak → committed transcript → Elise speaks a **model-generated**
     reply (not the canned line) → **barge-in cuts it within a beat**, opening word
     intact.
  3. Ollama unreachable → lab shows an error; voice session stays usable (no
     reply, no crash).
- `npm run typecheck`, `npm run lint`, `npm run build` clean.

## Resolved decisions

- Client transport: the **`openai` SDK** pointed at the same-origin proxy (not a
  hand-rolled SSE parser).
- Model detail stays server-side: the route **injects `LLM_MODEL`** and overrides
  the client-sent model.
- Persona/system prompt is **in the Ollama model card** for now; the client sends
  only the user turn.
- Reply → TTS: **buffer the full reply, then speak** it as one utterance.
- Single-shot per transcript; **no rolling history** this slice.
- New dependency: **`openai`**.
