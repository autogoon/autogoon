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
(`minimax/minimax-m2:nitro`) precisely because it doesn't restrict the kind of
roleplay her persona calls for; picking a different, more restrictive model for
a future companion would reintroduce that limit for her.

Calls go through the app's same-origin **`/api/llm` proxy route**, which
forwards to `LLM_URL` and injects `OPENROUTER_API_KEY` server-side as a Bearer
header — same-origin for the browser (no CORS juggling), streaming passes
straight through, and the key never reaches the client.

## One config object per companion

Each companion is a `Companion` entry in `src/lib/companions` (see
`companions.ts`):

```ts
export type Companion = {
  name: string;
  gender: "female" | "male" | "nonbinary"; // display-only, shown on the picker
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message
  model: string; // OpenRouter model slug the client requests for this companion
  contextWindow: number; // model context window (tokens); recorded for pruning
  passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
};
```

- `model` is an **OpenRouter model slug** (e.g. `minimax/minimax-m2:nitro`) —
  the client sends it directly in each chat-completions call, so different
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

`passesReasoning` marks a **reasoning model**: MiniMax M2 (Elise's model)
returns a private thinking block (`reasoning_details`) alongside its reply and
was trained with that reasoning present in history, so the app captures it from
the stream and replays it verbatim on Elise's stored turns. Elise carries
`passesReasoning: true`; a future non-reasoning companion sets it `false` and
the field is simply never sent.

### Adding a companion

Add a new `Companion` entry with its own `model`, `contextWindow`, `voiceId`,
and `systemPrompt`. If the persona text is long (as personas tend to be), give
it its own module — e.g. `elise-prompt.ts` exports `ELISE_SYSTEM_PROMPT`, a
plain template-literal string — and import it into `companions.ts`, so the
companion list itself stays readable.

## Configuration

Two env vars wire the app to OpenRouter (server-side only; see
[`.env.example`](./.env.example)):

- `LLM_URL` — `https://openrouter.ai/api/v1`.
- `OPENROUTER_API_KEY` — read only by the `/api/llm` proxy route, which adds it
  as a Bearer header. Set it in `.env.local` (gitignored); never commit a real
  key.

There is no `LLM_MODEL` — each companion's `model` field picks the model per
companion, so there's nothing global to configure.
