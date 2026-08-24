# Companions

Each companion is a distinct persona, run over the LLM backend. The
configuration is one `Companion` object per companion in
`src/lib/companions/companions.ts`, where every field is commented.

## The model

The app calls **OpenRouter**'s OpenAI-compatible chat-completions endpoint.
Claude and the OpenAI APIs both restrict explicit content, so neither is viable
here. OpenRouter fronts a wide range of hosted models, with no infrastructure to
stand up.

Explicit-content suitability is a property of the **chosen model**, not of
OpenRouter itself. One model runs every companion, picked under Settings →
Companion model from the models that can call tools — a companion who can't call
tools can talk about the toy but never drive it. Whether a model restricts the
roleplay a persona calls for is worth trying before settling on it; a pack can
name what it was written against (`recommendedModel`), and the card shows it.

**Provider** routes the model. OpenRouter lists one endpoint per provider per
model, and often several from one provider — a priority tier, a zero-retention
region — each with its own price, context length and supported parameters.
Default is OpenRouter's price-weighted load balancing; Nitro sorts by
throughput, Floor by price, Exacto by tool-calling reliability. Those four ride
the slug as a suffix. Pinned does not: it sends
`provider: { only: [tag], allow_fallbacks: false }`, so a busy or down provider
fails the request rather than routing elsewhere. Both forms are built in
`companions/model-settings.ts`.

The context, price and speed on the card are the pinned endpoint's figures, or
the range across every endpoint that is up. Which one a sorted request lands on
is decided by OpenRouter at request time and is not knowable here, so the card
gives both ends and a count rather than naming a provider.

The browser calls the provider **directly**, with the key the user entered in
Settings — OpenRouter allows any origin and every header the SDK sends, so no
server of ours sits in between and streaming is the provider's own response.

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

**Reasoning** (Settings → Companion model) replays `reasoning_details` — the
private thinking block a reasoning model returns alongside its reply — in the
conversation history. The app captures it and replays it verbatim on stored
turns; the mechanics are in `conversation.ts`.

Only some models were trained to read their own reasoning back, and OpenRouter
publishes nothing that says which: `supported_parameters` names `reasoning` when
a model _returns_ it, not when replaying it helps. The card says so and points
at the model's page. It is disabled where no endpoint advertises `reasoning`,
and the field is then never sent.

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

Companions runs on **the user's own keys**, entered under Settings → API keys:
an OpenRouter key for the replies, an ElevenLabs key for hearing and speaking,
and the chat endpoint (`https://openrouter.ai/api/v1` unless you point it
elsewhere). They are kept in this browser's localStorage and sent to nothing but
the two providers — there is no account, and no server of ours holds a key.

Both keys in force is the whole availability rule: with them, Companions is on
the home screen and the Goonpacks tab shows; without, neither does. A pasted key
is checked when it is saved, so a bad paste fails there rather than mid-session.

Running locally, put the keys in `.env` (see [`.env.example`](../.env.example))
and they are used as they are: a dev-server-only route (`src/app/api/dev/keys`)
hands them to the browser at load, the Settings fields show them locked, and
nothing is written to the browser. That route does not exist in a build, so a
build is always the pasted-key path.
