# Companions

Each companion is a distinct persona the app talks to over the LLM backend. This
doc describes how those personas are configured: **one `Companion` config object
per companion, carrying its own OpenRouter model, context window, voice, and
persona.**

## The model

The app talks to **OpenRouter**'s OpenAI-compatible chat-completions endpoint —
Claude and the OpenAI APIs both restrict explicit content, so neither is viable
here. OpenRouter fronts a wide range of hosted models, so each companion can
pick whichever model suits her persona (and swap it later) without standing up
any infrastructure. Explicit-content suitability is a property of the **chosen
model**, not of OpenRouter itself — Elise currently uses a permissive model
(`minimax/minimax-m3`) precisely because it doesn't restrict the kind of
roleplay her persona calls for (and it calls device tools far more reliably than
M2 did); picking a different, more restrictive model for a future companion
would reintroduce that limit for her.

Calls go through the app's same-origin **`/api/llm` proxy route**, which
forwards to `LLM_URL` and injects `OPENROUTER_API_KEY` server-side as a Bearer
header — same-origin for the browser (no CORS juggling), streaming passes
straight through, and the key never reaches the client.

## One config object per companion

The companions live in a **keyed record** in `src/lib/companions` (see
`companions.ts`) — `COMPANIONS: Record<CompanionId, Companion>`, where
`CompanionId` is a string-literal union of the ids. The picker order
(`companionList`) and the default selection (`DEFAULT_COMPANION_ID`) derive from
that one record. Each entry is a `Companion`:

```ts
export type Companion = {
  id: CompanionId; // stable key — must equal the record key; picker + thread key
  name: string;
  description: string; // one-line blurb shown on the picker card
  gender: "female" | "male" | "nonbinary"; // display-only, shown on the picker
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message
  model: string; // OpenRouter model slug the client requests for this companion
  contextWindow: number; // model context window (tokens); recorded for pruning
  passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
};
```

- `id` is the entry's **stable key** — it must equal the record key (a unit test
  enforces this), and it namespaces the saved conversation thread.
- `description` is the **one-line blurb** shown on the companion's picker card.
- `model` is an **OpenRouter model slug** (e.g. `minimax/minimax-m3`) — the
  client sends it directly in each chat-completions call, so different
  companions can run entirely different models.
- `contextWindow` records that model's context window in tokens, used to size
  conversation-history pruning.
- `voiceId` is an ElevenLabs voice id (not a secret; safe to keep in code).
- `systemPrompt` is the companion's **persona**, sent as the LLM's `system`
  message on every turn. It now lives in code rather than in a model card — see
  `elise-prompt.ts` below.

## Conversation memory

The app keeps a **rolling conversation thread** — every user and assistant turn
— and replays it to the model on each turn, so the companion remembers what was
said earlier. The thread is persisted to `localStorage` under a per-companion
key (`companions:thread:elise`), so it survives a reload; **Clear conversation**
in the panel wipes it (button-only — Companions registers no spoken words).

`passesReasoning` marks a **reasoning model**: MiniMax M3 (Elise's model)
returns a private thinking block (`reasoning_details`) alongside its reply and
was trained with that reasoning present in history, so the app captures it from
the stream and replays it verbatim on Elise's stored turns. Elise carries
`passesReasoning: true`; a future non-reasoning companion sets it `false` and
the field is simply never sent.

### Shared prompt sections

A `systemPrompt` is not one monolithic string per companion. The **mechanical
rules that are the same for everyone** — how a reply is formatted (spoken words
only, no narration), the baseline speaking style, and how the device is driven —
live once in `shared-prompt.ts` as persona-neutral blocks
(`OUTPUT_FORMAT_SECTION`, `SHARED_STYLE_BULLETS`, `CONTROL_SUMMARY_SECTION` —
the in-scene one-line intro to the two knobs, dropped into INTIMACY — and
`CONTROL_SECTION`). Each persona module interpolates them into place, so those
rules can't drift between companions. What stays in the persona module is only
that companion: her character, setup, tone, and disposition (crucially, **who
leads** during play — the shared control block is neutral on that). Personas are
written in the **second person** ("You're 21…") so they read as one voice with
the shared blocks. `CONTROL_SECTION` ends with the `{{TOY_STATUS}}` marker, so
it must come last in a prompt.

### Adding a companion

Add a new `Companion` entry (keyed by its `id`) with its own `model`,
`contextWindow`, `voiceId`, and `systemPrompt`, and widen the `CompanionId`
union. Give the persona its own module — e.g. `elise-prompt.ts` exports
`ELISE_SYSTEM_PROMPT` — that interpolates the shared sections from
`shared-prompt.ts` and fills in the rest, then import it into `companions.ts`.
The picker, switch and thread all derive from the record, so nothing else needs
touching.

## Device control

A companion **drives the device through LLM tools**. Each turn the app offers
the model a set of function tools — currently `start`, `stop`, `intensity` (a
percent 0–100 — how hard and fast the toy drives) and `variety` (`off` / `low` /
`medium` / `high` — how much it teases and mixes up the pace) — and when she
calls one the panel runs the same transport and knobs the on-screen controls
use. `intensity` takes a `percent` argument and is applied **live** (scaled
every tick, re-sent with a `refresh()`, no regeneration); `variety` takes a
`level` and reshapes the generated dip pattern (so it drops and regenerates the
not-yet-played future); `start`/`stop` take none. Whether she acts on a request
or declines is a disposition written into her `systemPrompt`, not a code gate.
Companions default to a **gentle baseline** — low intensity, light variety, plus
a one-shot stroke-minus tease at session start — and she builds up from there.

The device's **current state is folded into her system message every turn** —
whether the toy is **connected** to the app, whether it is **running**, and its
current **intensity percent and variety level** — so she always knows all of it
without a status tool, and stays in sync even when a level is changed via the
on-screen knobs rather than her own tools. The wording is plain and avoids the
in-app term "program."

**Tool calls are persisted and replayed.** Her `tool_calls` and their results
are stored on the conversation thread and replayed to the model as a proper
agentic sequence (assistant-with-`tool_calls` → `tool` result → spoken
reaction), so she sees her own prior actions — without which the model drifts
back to narrating actions instead of taking them. After a tool runs, its result
is fed back for a **second round-trip** so she reacts in words to what happened.

## Configuration

Two env vars wire the app to OpenRouter (server-side only; see
[`.env.example`](../.env.example)):

- `LLM_URL` — `https://openrouter.ai/api/v1`.
- `OPENROUTER_API_KEY` — read only by the `/api/llm` proxy route, which adds it
  as a Bearer header. Set it in `.env` (gitignored); never commit a real key.

There is no `LLM_MODEL` — each companion's `model` field picks the model per
companion, so there's nothing global to configure.
