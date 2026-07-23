# Companions

Each companion is a distinct persona the app talks to over the LLM backend. This
doc carries the design rationale; the configuration itself is one `Companion`
object per companion in `src/lib/companions/companions.ts` — every field is
commented there, so the type isn't repeated here.

## The model

The app talks to **OpenRouter**'s OpenAI-compatible chat-completions endpoint —
Claude and the OpenAI APIs both restrict explicit content, so neither is viable
here. OpenRouter fronts a wide range of hosted models, so each companion can
pick whichever model suits her persona (and swap it later) without standing up
any infrastructure. Explicit-content suitability is a property of the **chosen
model**, not of OpenRouter itself — Elise's current model (her `model` field in
`companions.ts`) is picked precisely because it doesn't restrict the kind of
roleplay her persona calls for, and it calls the device tools reliably.

Calls go through the app's same-origin **`/api/llm` proxy route**, which
forwards to `LLM_URL` and injects `OPENROUTER_API_KEY` server-side as a Bearer
header — same-origin for the browser (no CORS juggling), streaming passes
straight through, and the key never reaches the client.

Two field-level whys worth knowing (the rest are commented on the type):
`voiceId` and `model` aren't secrets, so they're safe in code even in a public
repo; and because each companion carries her own `model`, there is no global
`LLM_MODEL` to configure — different companions can run entirely different
models.

## One config object per companion

The companions live in a keyed record — `COMPANIONS` in
`src/lib/companions/companions.ts`. The picker order (`companionList`) derives
from that record, and the panel simply starts on its first entry. Each persona
is pure data: adding a companion is a new entry plus a persona module (e.g.
`elise-prompt.ts`) that interpolates the shared sections and fills in the
character — the picker, switch and saved thread all derive from the record, so
nothing else needs touching.

## Conversation memory

The app keeps a **rolling conversation thread** — every user and assistant turn
— and replays it to the model on each turn, so the companion remembers what was
said earlier. The thread is persisted to `localStorage` per companion
(`threadKeyFor` in `use-voice-session.ts`), so it survives a reload; the
**Clear** button in the panel wipes it (button-only — Companions registers no
spoken words).

`passesReasoning` marks a **reasoning model**: such a model returns a private
thinking block (`reasoning_details`) alongside its reply and was trained with
that reasoning present in history, so the app captures it from the stream and
replays it verbatim on that companion's stored turns (the mechanics are in
`conversation.ts`). A non-reasoning companion sets it `false` and the field is
simply never sent.

### Shared prompt sections

A `systemPrompt` is not one monolithic string per companion. The **mechanical
rules that are the same for everyone** — reply format, baseline speaking style,
how the device is driven — live once as persona-neutral blocks in
`shared-prompt.ts` (each export is commented with where it slots in), and each
persona module interpolates them into place, so those rules can't drift between
companions. What stays in the persona module is only that companion: her
character, setup, tone, and disposition (crucially, **who leads** during play —
the shared control block is neutral on that). Personas are written in the
**second person** ("You're 21…") so they read as one voice with the shared
blocks.

## Device control

A companion **drives the device through LLM tools** — start/stop, the intensity
and variety knobs, and (for a companion with pictures) `send_picture`. When she
calls one, the panel runs **the same transport and knobs the on-screen controls
use** — there is one path, not a parallel one. The tool definitions, argument
shapes, and which knob applies live versus regenerates are all commented in
`companions-panel.tsx`. Whether she acts on a request or declines is a
disposition written into her `systemPrompt`, not a code gate. Companions default
to a **gentle baseline** — low intensity, light variety, a one-shot stroke-minus
tease at session start — and she builds up from there.

The device's **current state is folded into her system message every turn** (see
`getDeviceState` in the panel) — so she always knows whether the toy is
connected and running and where the knobs sit, without a status tool, and stays
in sync even when a level is changed via the on-screen knobs rather than her own
tools.

**Tool calls are persisted and replayed.** Her `tool_calls` and their results
are stored on the conversation thread and replayed to the model as a proper
agentic sequence (assistant-with-`tool_calls` → `tool` result → spoken
reaction), so she sees her own prior actions — without which the model drifts
back to narrating actions instead of taking them. After a tool runs, its result
is fed back for a **second round-trip** so she reacts in words to what happened.

## Pictures

A companion **with pictures** gets the `send_picture` tool; its description
lists her pictures numbered, one caption each, and she picks the one that fits
the moment by number — she chooses on the _caption_, so the vision work happens
offline, never in the call. Sending pops the picture open in a lightbox and
leaves it in the transcript as a thumbnail, stored on the thread turn so a sent
picture survives a reload. A companion with no pictures never sees the tool, and
the shared pictures prompt block is only interpolated into a persona that has
some.

- **Pictures are local-only.** Drop images in `public/companions/<id>/` —
  nothing under there is committed, so supply your own.
  `scripts/generate-companion-pictures.mjs` globs each folder into a generated
  module (it runs before every npm entry point via the `gen:pictures`
  pre-hooks), which is what makes `companion.pictures` a plain synchronous
  array.
- **Captions come from a vision model, offline.** A picture's description is a
  sidecar `.txt` beside it, written by `npm run describe <path>` /
  `npm run describe:missing` — models, env and semantics are in the two scripts'
  header comments (`scripts/describe-image.mjs`,
  `scripts/describe-missing.mjs`).

## Configuration

Everything is wired through env vars documented in
[`.env.example`](../.env.example) — `LLM_URL`, `OPENROUTER_API_KEY`,
`ELEVENLABS_API_KEY`, all read server-side only, so no key ever reaches the
client.

The one to understand is **`COMPANIONS_ACCESS_IDS`** — the access gate. The
Companions routes spend real money (LLM, TTS, STT) behind a shared URL, so
they're **fail-closed** (`access-check.ts`): with no IDs configured, the mode is
hidden and every paid route rejects everything — including locally. Set at least
one ID and enter it under Settings to unlock; hand out different IDs to
different people and revoke one by deleting it.
