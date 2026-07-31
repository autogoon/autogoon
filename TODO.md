# TODO

New features, additions and changes, including "run the experiment and see"
where the task is defined but the answer isn't. The divide against the other
files is in [CLAUDE.md → Documentation](./CLAUDE.md#documentation).

## General

### Don't connect to the microphone on load

Particularly annoying during development, where the app sits open and listening
for keywords without being used. Connecting on load gains little when playing
either. Turning listening on is one click, once.

### Stop the program when the device disconnects

A device that drops mid-run leaves the Player's tick loop running. The speed
send throws. `scheduleNextTick` reports the failure and schedules the next tick
anyway, and `lastDeviceSpeed` only updates on a send that succeeded. Every tick
re-sends the same speed and logs the same error, several times a second, until
the program would have ended. Valve sends report nothing at all: `setValve`
discards its rejection.

Stopping belongs in the Player, not in each engine. The Player is the single
path to the device, so one stop covers every play mode and no engine needs a
device reference. To settle:

- whether a disconnect stops or pauses (a pause would let a reconnect carry on
  where it left off);
- how many consecutive failures mean gone rather than a blip;
- what the screen says. A device that has dropped is the one failure the user
  can't otherwise see.

### Show remaining provider credits in the app

Saves visiting the providers' dashboards.

### Finish intensity

One global percentage in Settings: the intensity you'd want to finish at. What
reads it:

- **Finish** goes straight to it;
- **companion-set intensity** is multiplied by it. They set 100, it lands on 50,
  and they never see the setting or the scaled number;
- **the wind-down** starts at it and ramps down.

What doesn't:

- **torture** and **the ruins**, absolute on purpose;
- **Autopilot**, which recreates Autoblow's own.

A companion picking a number has no idea what it does to you. The only fix today
is saying so in words, every session and every new companion.

### Put the wind-down on a curve

It steps down in two straight-line phases. Give it the `RAMP_GAMMA` curve Goon's
dips ramp on, so its steps shrink as it approaches a standstill instead of
stepping evenly the whole way. A 5-unit change at speed 10 is felt far more than
the same change at speed 90.

Goon, Groove and Companions each carry their own copy of the constants.

## Companions

### Split use-voice-session.ts and companions-panel/index.tsx

`use-voice-session.ts` and `companions-panel/index.tsx` have both grown long
enough that several unrelated concerns sit in one file. The coupling is
deliberate. The mic and STT callbacks are created once and outlive many renders,
so everything they read has to be a ref, and anything moved out still needs
those refs. The work is a structure that carries them, not smaller files.

`submitText` and its helpers are the bulk of the hook and need most of the refs.
Extracting the turn runner means inventing an explicit session-context to carry
them, which is why this hasn't happened.

### Activity cutoff

A spend backstop, separate from ambient chat's own `wait_for_user` stop (shipped
— see [modes/COMPANIONS.md](./modes/COMPANIONS.md)). After long enough with no
user turn and no control touched, stop the program.

Stopping the program already stops ambient chat, so the one cutoff covers a
session left running in an empty room, where LLM and TTS spend would otherwise
run indefinitely.

The hard part is the number, not the mechanism. Long silences during play are
normal: the device is working and there is nothing to say. A cutoff tuned for an
empty room must not fire on someone who is simply quiet.

Worth warning before it stops.

### Reply length belongs to the companion

`SHARED_STYLE_BULLETS` in `shared-prompt.ts` tells every companion to keep
replies short, "usually a few sentences". So a terse persona and a verbose one
get the same instruction, and an author who wants a talker has to contradict the
shared block rather than write their own rule.

How talkative a companion is belongs in their persona.

### The companion picks the after-play

The companion gets a tool for each after-play and picks which one to use when
you say you're cumming, so the ending stops being a setting and becomes
something they do to you. And because they can choose, they can say they will,
and do something else.

### Pick packs up off disk in dev

Iterating on a pack means: edit, `npm run goonpack:build`, open the Goonpacks
tab, pick the zip, confirm the replace. Every time. The build is the only step
doing anything the app couldn't do itself.

On a locally-run server, have the app ask a route on load what pack directories
are sitting in `goonpacks/`. Import each one exactly as though it had been
chosen in the picker and replaced: the same validation, the same storage. Reload
becomes the whole loop.

The source directory rather than a built zip, because validation now runs on the
extracted tree. The tree is the thing that ships and the zip only carries it, so
importing the directory imports what would ship.

Deliberately load-time only, with no watching for changes. A reload is a small
enough ask, and polling can come later if it isn't.

**Dev-server only, and it has to be enforced server-side.** The route reads the
developer's own filesystem, which is what a deploy must not do.
`access-check.ts` already has the `NODE_ENV === 'development'` precedent to
follow.

Also worth deciding what happens when a disk pack and an installed one collide,
and whether a pack imported this way should be visibly marked as having come
from disk rather than chosen.

A stopgap: [Goonpack kit](./roadmap/GOONPACK-KIT.md) is where pack authoring
moves into the app properly. Small enough to be worth doing anyway.

### Streaming per companion

`stream: true` is hardcoded for every request, and on a spoken turn it gains
nothing: the reply is buffered in full and handed to TTS complete (the
`submitText` comment in `use-voice-session.ts` says so). All streaming does is
fill the transcript word by word, worth having on a typed turn.

So make it a per-companion field like `model` and `passesReasoning`, and a
manifest field packs can set.

**Where this came from:** a streamed MiniMax reply whose reasoning leaked into
what the companion said, because OpenRouter didn't cleanly separate the two.
`mergeReasoning` in `llm/client.ts` handles that one, folding
`reasoning_details` into its own array. A non-streamed response carries
reasoning and content as separate fields and can't blur them. "Don't stream" is
then a real setting rather than a workaround for the next model that behaves
that way.

To settle: what the transcript shows while a non-streaming turn generates, since
no text arrives until it's done.

### Pin a provider

A companion's model is a slug, and OpenRouter can route each turn to any
provider serving it. Consecutive turns can land on different providers, making
comparison by hand impossible and defeating prompt caching, which is
per-provider.

Send a provider (or endpoint tag, e.g. `xiaomi/fp8`) as OpenRouter's `provider`
field, with fallbacks off so a pin that can't be served fails loudly. Show which
provider served each turn: it comes back on every response.

### Reconsider the second person the prompts assume

The shared prompt and the ambient cue both address the user as "he" throughout,
and the toy-start rule added more of it. The premise is reasonable. It's a male
masturbator, and nearly every user is male.

But it is an assumption sitting in copy rather than a setting, and the
companions themselves aren't gendered anywhere else in the app.

Worth deciding deliberately rather than by default. The options:

- leave it (and say so somewhere, so it reads as a choice);
- neutralise the prompt copy;
- make it a setting. That is the most work, and the only option pack authors
  have to follow: pack prompts are author-written and would have to match
  whatever convention is picked.

Neutral pronouns in prompt copy also cost some clarity. "He" and "she" in the
same block disambiguate who is being talked about in a way "they" twice over
does not.

### Bring-your-own API keys

Move the paid services (LLM, TTS, STT) onto keys the **user supplies in the
app** instead of the server's `.env`:

- entered once;
- stored client-side;
- never on the server.

A **hosted public build** becomes viable this way. Every user funds their own
usage, so there's nothing for accounts or per-user rate limiting to protect.
[Goonpacks](#goonpacks) are orthogonal: an imported pack runs on whatever keys
the build has, the same way companions do today. Locally that is the server's
`.env`; on a hosted build, the user's own.

To settle: whether the browser calls providers directly or the proxy routes
accept the user's key per-request, and what `.env` keys remain as a local-dev
convenience.

The demo access gate (`COMPANIONS_ACCESS_IDS`) **retires with the server keys**.
Its only job was protecting them.

### Companion time zones

A pack author can put a persona anywhere, but only the user's clock is real: the
prompt's TIME line is the browser's.

Give a located persona their own: an IANA `timezone` field and a second TIME
line ("TIME (yours, in Riga): …"), so it can be the middle of their night while
it is the middle of the user's day. The app does all the arithmetic, with no LLM
offset math: models are passable at offsets and quietly wrong about DST.

One rule ships with it: their clock shows up in what they say.

## Goonpacks

- **Accept `.gif` as media.** A collected set will have the odd animated gif in
  it, and today import rejects it as an unsupported file. The `kind` stays
  `image` — `<video>` can't play a gif.

- **Phase 2 — voices from prompts.** A `voiceId` is private to its ElevenLabs
  account, so a pack sent to someone else names a voice their account can't
  play. The follow-up carries a voice _prompt_ instead: the app submits it to
  ElevenLabs voice design, gets three candidate voices back, and the user picks
  or iterates. v1 ships `voiceId` and accepts the limitation.
