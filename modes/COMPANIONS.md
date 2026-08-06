# Companions

Each companion is a distinct persona, run over the LLM backend. This doc carries
the design rationale. The configuration is one `Companion` object per companion
in `src/lib/companions/companions.ts`, where every field is commented.

## The model

The app calls **OpenRouter**'s OpenAI-compatible chat-completions endpoint.
Claude and the OpenAI APIs both restrict explicit content, so neither is viable
here. OpenRouter fronts a wide range of hosted models. A companion's model is
chosen per persona and can be changed later, with no infrastructure to stand up.

Explicit-content suitability is a property of the **chosen model**, not of
OpenRouter itself. A companion's model (their `model` field in `companions.ts`)
is picked because it doesn't restrict the kind of roleplay their persona calls
for, and because it calls the device tools reliably.

Calls go through the app's same-origin **`/api/llm` proxy route**. It forwards
to `LLM_URL` and injects `OPENROUTER_API_KEY` server-side as a Bearer header.
Requests stay same-origin, so there is no CORS handling. Streaming passes
straight through.

## One config object per companion

The companions live in a keyed record, `COMPANIONS` in
`src/lib/companions/companions.ts`. The picker order (`companionList`) derives
from that record, and the panel starts on its first entry.

Each persona is pure data. Adding a companion is a new entry plus a persona
module (e.g. `aimee-prompt.ts`) that interpolates the shared sections and fills
in the character. The picker, switch and saved thread all derive from the
record, so nothing else needs touching.

## Conversation memory

The app keeps a **rolling conversation thread** of every user and assistant
turn, and replays it to the model on each turn, so the companion remembers what
was said earlier. The thread is persisted to `localStorage` per companion
(`threadKeyFor` in `use-voice-session.ts`) and is restored on reload. The
**Clear** button in the panel wipes it. Clear is button-only; Companions
registers no spoken words.

**Time passes between turns.** Every turn is stamped when it lands. The
transcript shows each message's time, with a date header where a new day starts,
and the companion is told the current date and time — theirs, the user's, or
both — every turn.

A longer break — an hour away, overnight — reaches them as a stage direction
("(6 hours pass.)"), so they pick up on the gap rather than carrying on
mid-sentence. Conversations saved before timestamps existed have none. Those
turns show no times and never trigger a marker. The threshold and the marker
shape are commented in `conversation.ts`.

`passesReasoning` marks a **reasoning model**. Such a model returns a private
thinking block (`reasoning_details`) alongside its reply, and was trained with
that reasoning present in history. The app captures it from the stream and
replays it verbatim on that companion's stored turns; the mechanics are in
`conversation.ts`. A non-reasoning companion sets it `false`, and the field is
never sent.

### Shared prompt sections

The **mechanical rules that are the same for everyone** live once as
persona-neutral blocks in `shared-prompt.ts`:

- the reply format;
- the baseline speaking style;
- what the device is and how it's driven;
- what pictures and videos they have, and how to send one;
- how to read each clock line they are sent;
- how a turn arrives, and when to stop taking one.

Each export is commented with where it slots in. A persona module interpolates
the reply-format, speaking-style, device and media blocks as `{{tokens}}`; the
clock and conversation blocks are appended at load (`fillSharedSections` in
`src/lib/goonpacks/prompt.ts`), so a pack author never has to know they exist.
Either way those rules can't drift between companions.

The device description is part of that shared set because **what the toy does to
you isn't a persona's to invent.** With only the tool names to go on, a model
infers the wrong hardware and says so mid-scene. Written once, no pack author
has to know the hardware, and no companion is wrong about it.

What stays in the persona module is only that companion:

- their character;
- their setup;
- their tone;
- their disposition — **who leads between them and the user**, which the shared
  blocks leave open.

Control of the toy is not among them. The shared block settles it for everyone;
a persona written against that block contradicts it rather than overriding it.
Personas are written in the **second person** ("You're 23, from just outside
Manchester…") so they read as one voice with the shared blocks.

## Device control

A companion **drives the device through LLM tools**:

- start/stop;
- the intensity and variety knobs;
- `search_media` and `send_media`, for a companion with media.

When one is called, the panel runs **the same transport and knobs the on-screen
controls use**. The tool definitions, argument shapes, and which knob applies
live versus regenerates are all commented at their declarations in
`companions-panel/index.tsx`.

Whether a companion acts on a request or declines is a disposition written into
their `systemPrompt`, not a code gate. Companions default to a **gentle
baseline** — 10% intensity, medium variety, and a one-shot stroke-minus tease at
session start — and build up from there.

The device's **current state reaches the companion every turn** (see
`getDeviceState` in the panel). They always know whether the toy is connected
and running, and where the knobs sit, without a status tool — including after a
level is changed with the on-screen knobs rather than their own tools.

It arrives as its own system message at the **end** of the request, along with
the clock, rather than inside the persona prompt. Those two values are the only
difference between one turn's request and the next. Putting them last leaves
everything before them — persona and whole conversation — identical, which is
what prompt caching matches on.

**Tool calls are persisted and replayed.** A companion's `tool_calls` and the
results they return are stored on the thread, and replayed to the model as an
agentic sequence: assistant-with-`tool_calls` → `tool` result → spoken reaction.
Without that, the model drifts back to narrating actions instead of taking them.

**A turn can hold a chain of calls.** After a tool runs, its result is fed back
and the tools are offered again. One turn can search for a picture and then send
it, or set two knobs, rather than the second call waiting for a later turn.

The chain ends when the companion answers with words instead of a call — their
reaction to what they did. A cap bounds a turn that never gets there
(`MAX_TOOL_ROUNDS` in `use-voice-session.ts`, commented with why).

## Filling a silence

A companion doesn't wait to be spoken to. At the end of each of their turns they
line up another. They might pick the thread back up, tease you about the quiet,
or say something about what the toy is doing to you.

Start speaking and the pending turn is dropped.

**The companion decides when to stop, not a clock.** Having said their piece, or
asked whether you're still there and would rather you answered, they call
`wait_for_user` and go quiet until you speak.

**How readily a companion fills a silence is set per companion.** A goonpack
gives them two settings, one for while the toy is idle and one for while it's
running. Someone of few words can still keep up a running commentary once things
are underway. The picker cards show both, and [GOONPACKS.md](../GOONPACKS.md)
explains what each setting does.

## Pictures and videos

A companion **with media** asks for a picture rather than picking one off a
list. Their prompt carries a summary of what their set holds, enough to know
what there is to ask for. When they want to show you something they describe it
in their own words: "me on my knees looking up", "something on a beach". That
comes back as a set of matches, each with its one-line caption, and they send
the one that fits. They can narrow the search to pictures only or videos only.

The search reads each item's caption and the longer description written
alongside it, both written when the pack was assembled rather than during play.
What they choose from is the captions. A search with no matches comes back as
that answer, so they ask for something else instead of talking about a picture
that never arrived.

Within one conversation they won't send you the same thing twice. What has
already been sent is left out of later searches, read back off the conversation
itself, so a reload doesn't reset it.

Sending pops it open in a lightbox and leaves it in the transcript as a
thumbnail. A video plays inline in the transcript, and full-size in the
lightbox. What was sent is stored on the thread turn, and is there again after a
reload. While the lightbox is open, a badge in its top corner shows every stage
of a turn, from you speaking to them speaking.

A companion with nothing to send gets neither tool, and is told outright that
they have nothing. Ask, and they say so.

Pictures and videos are **bring-your-own**. They arrive via a
[goonpack](../GOONPACKS.md). The built-in companions ship with none; give one
media by importing an overlay pack for them.

## Goonpacks

The Companions screen lists the built-ins alongside any packs you've imported. A
companion's card carries pickers for their pack version and any overlay. Pack
admin — importing, removing, seeing what each pack brings — lives on the
Goonpacks tab. See [GOONPACKS.md](../GOONPACKS.md) for assembling and importing
a pack.

## Configuration

Everything is wired through env vars documented in
[`.env.example`](../.env.example): `LLM_URL`, `OPENROUTER_API_KEY` and
`ELEVENLABS_API_KEY`. All are read server-side only, so no key ever reaches the
client.

**`COMPANIONS_ACCESS_IDS`** is the access gate. The Companions routes spend real
money (LLM, TTS, STT) behind a shared URL, so on a deploy they are
**fail-closed** (`access-check.ts`). With no IDs configured, the mode is hidden
and every paid route rejects everything. Set at least one ID and enter it under
Settings to unlock. Hand out different IDs to different people, and revoke one
by deleting it.

Running locally (`npm run dev`) needs none of that. The gate is open in dev, and
Companions appears as soon as your keys are in `.env`.
