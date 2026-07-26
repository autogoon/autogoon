# Companions

Each companion is a distinct persona the app talks to over the LLM backend. This
doc carries the design rationale; the configuration itself is one `Companion`
object per companion in `src/lib/companions/companions.ts` — every field is
commented there, so the type isn't repeated here.

## The model

The app talks to **OpenRouter**'s OpenAI-compatible chat-completions endpoint —
Claude and the OpenAI APIs both restrict explicit content, so neither is viable
here. OpenRouter fronts a wide range of hosted models, so each companion can
pick whichever model suits their persona (and swap it later) without standing up
any infrastructure. Explicit-content suitability is a property of the **chosen
model**, not of OpenRouter itself — a companion's model (their `model` field in
`companions.ts`) is picked precisely because it doesn't restrict the kind of
roleplay their persona calls for, and it calls the device tools reliably.

Calls go through the app's same-origin **`/api/llm` proxy route**, which
forwards to `LLM_URL` and injects `OPENROUTER_API_KEY` server-side as a Bearer
header — same-origin for the browser (no CORS juggling), streaming passes
straight through, and the key never reaches the client.

Two field-level whys worth knowing (the rest are commented on the type):
`voiceId` and `model` aren't secrets, so they're safe in code even in a public
repo; and because each companion carries their own `model`, different companions
can run entirely different models with nothing global to configure.

## One config object per companion

The companions live in a keyed record — `COMPANIONS` in
`src/lib/companions/companions.ts`. The picker order (`companionList`) derives
from that record, and the panel simply starts on its first entry. Each persona
is pure data: adding a companion is a new entry plus a persona module (e.g.
`aimee-prompt.ts`) that interpolates the shared sections and fills in the
character — the picker, switch and saved thread all derive from the record, so
nothing else needs touching.

## Conversation memory

The app keeps a **rolling conversation thread** — every user and assistant turn
— and replays it to the model on each turn, so the companion remembers what was
said earlier. The thread is persisted to `localStorage` per companion
(`threadKeyFor` in `use-voice-session.ts`), so it survives a reload; the
**Clear** button in the panel wipes it (button-only — Companions registers no
spoken words).

**Time passes on a call.** Every turn is stamped when it lands, the transcript
shows each message's time (with a date header where a new day starts), and the
companion is told the current date and time every turn. A longer break — an hour
away, overnight — reaches them as a stage direction ("(6 hours pass.)"), so they
come back to you like someone who noticed you were gone, not mid-sentence.
Conversations saved before timestamps existed simply have none: those turns show
no times and never trigger a marker. The mechanics (the threshold, the marker
shape) are commented in `conversation.ts`.

`passesReasoning` marks a **reasoning model**: such a model returns a private
thinking block (`reasoning_details`) alongside its reply and was trained with
that reasoning present in history, so the app captures it from the stream and
replays it verbatim on that companion's stored turns (the mechanics are in
`conversation.ts`). A non-reasoning companion sets it `false` and the field is
simply never sent.

### Shared prompt sections

A `systemPrompt` is not one monolithic string per companion. The **mechanical
rules that are the same for everyone** — reply format, baseline speaking style,
what the device is and how it's driven — live once as persona-neutral blocks in
`shared-prompt.ts` (each export is commented with where it slots in), and each
persona module interpolates them into place, so those rules can't drift between
companions.

The device description is part of that shared set for a reason: **what the toy
does to you isn't a persona's to invent.** Left to infer the hardware from the
tool names, a model guesses — the wrong shape, the wrong sensation, sometimes
the wrong act — and it guesses mid-scene, where the words are the whole point.
Written once, no pack author has to know the hardware, and no companion is wrong
about it. What stays in the persona module is only that companion: their
character, setup, tone, and disposition (crucially, **who leads** during play —
the shared control block is neutral on that). Personas are written in the
**second person** ("You're 21…") so they read as one voice with the shared
blocks.

## Device control

A companion **drives the device through LLM tools** — start/stop, the intensity
and variety knobs, (for a companion with media) `send_media`, and
`wait_for_user`, which is how a run of unprompted turns is ended (see
[Filling a silence](#filling-a-silence)). When one is called, the panel runs
**the same transport and knobs the on-screen controls use** — there is one path,
not a parallel one. The tool definitions, argument shapes, and which knob
applies live versus regenerates are all commented in
`companions-panel/index.tsx`. Whether a companion acts on a request or declines
is a disposition written into their `systemPrompt`, not a code gate. Companions
default to a **gentle baseline** — low intensity, light variety, a one-shot
stroke-minus tease at session start — and build up from there.

The device's **current state reaches the companion every turn** (see
`getDeviceState` in the panel) — so they always know whether the toy is
connected and running and where the knobs sit, without a status tool, and stay
in sync even when a level is changed via the on-screen knobs rather than their
own tools. It arrives as its own system message at the **end** of the request,
along with the clock, rather than inside the persona prompt: those two values
are the only thing that differs between one turn's request and the next, so
putting them last leaves everything before them — persona and whole conversation
— identical, which is the shape prompt caching can reuse.

**Tool calls are persisted and replayed.** A companion's `tool_calls` and the
results they return are stored on the thread and replayed to the model as a
proper agentic sequence (assistant-with-`tool_calls` → `tool` result → spoken
reaction), so they see their own prior actions — without which the model drifts
back to narrating actions instead of taking them. After a tool runs, its result
is fed back for a **second round-trip** so they react in words to what happened.

## Filling a silence

A companion doesn't wait to be spoken to. At the end of each of their turns they
line up another, so a lull gets filled rather than sitting there — picking the
thread back up, teasing you about the quiet, or saying something about what the
toy is doing to you. This is what makes it possible to lie back mid-session and
let them drive. Start speaking and the pending turn is dropped: a real reply is
coming, so there's no silence left to fill.

**The companion decides when to stop, not a clock.** Having said their piece —
or asked whether you're still there and would rather you answered — they call
`wait_for_user` and go quiet until you speak. That's what keeps it from becoming
a monologue into an empty room, and why no timeout is needed to switch them off.

**How readily a companion fills a silence is their own**, as two separate
settings a goonpack gives them: one for while the toy is idle, one for while
it's running. They're separate because the appetites are: someone of few words
can still keep up a running commentary once things are underway. The picker
cards show both, and [GOONPACKS.md](../GOONPACKS.md) explains what the numbers
buy.

## Pictures and videos

A companion **with media** gets the `send_media` tool. Its description is one
numbered list over everything they have — each entry marked picture or video,
with its one-line caption — and they pick what fits the moment by number. They
choose on the _caption_, so the vision work happens offline, never during play.
They can also say which sort they meant; if that disagrees with the number they
picked, the call is refused with a correction rather than sending the wrong
thing.

Sending pops it open in a lightbox and leaves it in the transcript as a
thumbnail — a video plays there inline, and full-size in the lightbox — stored
on the thread turn so what was sent survives a reload. While the lightbox is
open, a badge in its top corner shows the conversation live: you speaking, the
companion thinking, their reply streaming in, their voice loading, them
speaking. A companion with nothing to send never sees the tool, and the shared
media prompt block is only interpolated into a persona that has some.

Pictures and videos are **bring-your-own** — they arrive via a
[goonpack](../GOONPACKS.md), never bundled with the app. The built-in companions
ship with none; give one media by importing an overlay pack for them.

## Goonpacks

The Companions screen lists the built-ins alongside any packs you've imported. A
companion's card carries pickers for their pack version and any overlay, so you
choose exactly what plays; pack admin — importing, removing, seeing what each
pack brings — lives on the Goonpacks tab. See [GOONPACKS.md](../GOONPACKS.md)
for assembling and importing a pack.

## Configuration

Everything is wired through env vars documented in
[`.env.example`](../.env.example) — `LLM_URL`, `OPENROUTER_API_KEY`,
`ELEVENLABS_API_KEY`, all read server-side only, so no key ever reaches the
client.

The one to understand is **`COMPANIONS_ACCESS_IDS`** — the access gate. The
Companions routes spend real money (LLM, TTS, STT) behind a shared URL, so on a
deploy they're **fail-closed** (`access-check.ts`): with no IDs configured, the
mode is hidden and every paid route rejects everything. Set at least one ID and
enter it under Settings to unlock; hand out different IDs to different people
and revoke one by deleting it.

Running locally (`npm run dev`) needs none of that — the gate is open in dev,
and Companions appears as soon as your keys are in `.env`.
