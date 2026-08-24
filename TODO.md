# TODO

New features, additions and changes, including "run the experiment and see"
where the task is defined but the answer isn't. The divide against the other
files is in [CLAUDE.md → Documentation](./CLAUDE.md#documentation).

## General

### Stop the program when the device disconnects

A device that drops mid-run leaves the Player's tick loop running. The speed
send throws. `scheduleNextTick` reports the failure and schedules the next tick
anyway, and `lastDeviceSpeed` only updates on a send that succeeded. Every tick
re-sends the same speed and logs the same error, several times a second, until
the program would have ended. Valve sends report nothing at all: rejections from
`setValve` are ignored.

Stopping belongs in the Player, not in each engine. The Player is the single
path to the device, so one stop covers every play mode and no engine needs a
device reference. To settle:

- whether a disconnect stops or pauses (a pause would let a reconnect carry on
  where it left off);
- how many consecutive failures mean the device is gone rather than momentarily
  unreachable;
- what the UI displays. A device that has dropped is the one failure the user
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

No mechanism informs a companion what a number does. The only fix today is
saying so in words, every session and every new companion.

### Put the wind-down on a curve

It steps down in two straight-line phases. Give it the `RAMP_GAMMA` curve Goon's
dips ramp on, so its steps shrink as it approaches a standstill. A 5-unit change
at speed 10 is felt far more than the same change at speed 90.

Goon, Groove and Companions each carry their own copy of the constants.

## Companions

### Split use-voice-session.ts and companions-panel/index.tsx

`use-voice-session.ts` and `companions-panel/index.tsx` have both grown long
enough that several unrelated concerns exist in each. The coupling is
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

Stopping the program does not stop ambient chat: the program's state only picks
which delay curve applies (`ambient.ts`), and `endSession` — leaving Companions
— is the one thing that ends the loop. So the cutoff has to stop both, or a
session left running in an empty room goes on spending on LLM and TTS with the
device already at rest.

Long silences during play are normal: the device is working and there is nothing
to say. A cutoff tuned for an empty room must not fire on someone who is simply
quiet.

Warn before stopping.

### Reply length belongs to the companion

`SHARED_STYLE_BULLETS` in `shared-prompt.ts` instructs every companion to keep
replies short, "two or three sentences". So a terse persona and a verbose one
get the same instruction, and an author who wants a talker has to contradict the
shared block rather than write their own rule.

How talkative a companion is belongs in their persona.

### The companion picks the after-play

The companion gets a tool for each after-play and picks which one to use when
you say you're cumming, so the ending stops being a setting and becomes
something they do to you. Because the choice is theirs, they can promise one
ending and give you another.

### Score a search on what an experiment recorded

Every media item carries the fields the experiment that described it recorded —
`CompanionMedia.values`, straight out of the sidecar's frontmatter — and nothing
reads them. `searchMedia` scores the caption and the long description and
nothing else.

The first one worth scoring is `text`: words on the picture itself, which is the
strongest "more of this" signal. It should count for what a caption hit counts
for. The rest stay unscored until there is a reason.

**The scoring is the experiment's, not the pack's** — a pack can be built from
any experiment, and which fields are worth what is a property of the questions
that experiment asked. Where that lives is unsettled: the experiment registry is
server-only (its modules import node's filesystem to run a model), so a scoring
_function_ can't cross into the browser without splitting the parser out, while
a scoring _config_ is data and travels the same route as the pack.

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

Neutral pronouns in prompt copy cost clarity. "He" and "she" in the same block
disambiguate who is being talked about in a way "they" twice over does not.

### The user's own time zone

The THEIR TIME line comes from the browser's zone, so it displays the machine's
local time. There is no way to say otherwise, and there are reasons to want to:

- a scene set somewhere the user isn't;
- being away from home, and wanting the companion to carry on as though you
  weren't;
- not wanting a real location shared with the companion;
- not wanting any time zone at all shared with the companion.

A setting holding an IANA zone, used when it is set and the browser's when it
isn't, is the whole of it. `browserTimeZone` is already the one place deriving
the user's clock, and everything downstream of it takes a zone explicitly, so
the setting has one call site to replace.

### One picture per turn

The shared prompt's media section specifies "Only send one picture or video per
turn". No code enforces it. `use-voice-session.ts` runs up to `MAX_TOOL_ROUNDS`
rounds per turn and dispatches every call in each round's `toolCalls`, so a turn
can carry any number of `send_media` calls.

Cap it at one. A second call in the same turn returns a refusal string rather
than sending. The companion is then told why nothing arrived.

To settle: what the refusal says. It is all the model has to go on, and one that
reads as "no pictures" would stop them offering any.

## Inference

### Drop "corpus" as a term

A corpus is a pack's `media/`, which makes the word a second name for something
that already has one. It describes how labelling happens to be implemented, not
what the feature is, and a reader meeting it has to be told the equivalence
before the sentence means anything.

It is throughout `src/inference/` — a module, a hook, their tests, the API
routes, the panel and the review screen — through the two scripts that import
them (`scripts/experiment-run.ts`, `scripts/summarise-pack.ts`), and through
[INFERENCE.md](./INFERENCE.md) and
[docs/2026-08-02-inference-ui-spec.md](./docs/2026-08-02-inference-ui-spec.md).
So it is a rename of modules, hooks and exported functions, not a search and
replace over prose. What replaces it is the first thing to settle: the pack, or
its media, depending on the sentence.

### Let the Inference screen write a plain sidecar

The Inference screen is most of the caption-review screen
[GOONPACK-KIT.md](./roadmap/GOONPACK-KIT.md) describes — a picture beside what a
model said about it, keyboard-driven, editable. What stops it being that is the
experiment: every answer is stamped with the experiment that produced it, and
every file it writes is named for one, so there is no way to sit down with a
pack and fix a caption.

Writing the stock `<stem>.md` when no experiment is chosen would close the gap.
An experiment run keeps its stamped files and its ground-truth rules; a plain
edit writes the sidecar a pack plays with. That is the kit's first piece, on the
screen that already exists.

To settle: whether a hand-written caption still counts as ground truth for
scoring, and what happens when an experiment later generates an answer for an
item somebody has already edited by hand.

## Goonpacks

- **Accept `.gif` as media.** A collected set will have the odd animated gif in
  it, and today it lands in `strays` — dropped from the media set, warned about
  by the build script and invisible in the app. The `kind` stays `image` —
  `<video>` can't play a gif.

- **Voices from prompts.** A `voiceId` is private to its ElevenLabs account, so
  a pack sent to someone else names a voice their account can't play. Carrying a
  voice _prompt_ instead would fix it: the app submits the prompt to ElevenLabs
  voice design, gets three candidate voices back, and the user picks or
  iterates. v1 ships `voiceId` and accepts the limitation.

- **When a variant is an overlay, a version, or a new companion.** An overlay
  may replace everything a session shows except `name` and `gender`, the persona
  prompt included, so one can read as a different character entirely. The only
  rule stated today is about memory: an overlay is the same companion and keeps
  the same conversation. A holiday pack — the same persona somewhere else, with
  their own prompt saying so and their own pictures — is an overlay by the
  letter of that rule and a new companion by how differently it reads, and an
  author has nothing to decide it by.

  `version` is a third path, open only to the base pack's own author: it is free
  text, so they can ship the variant as a version ("bikini 1.0.0"). It carries a
  consequence an overlay and a new companion don't. Versions sort newest first
  and the newest is the default, so a variant shipped that way becomes who the
  companion is until someone picks otherwise. A version shares the pack's `id`,
  and the id carries the publisher name. Anyone else is choosing between an
  overlay and a new companion.

  None of it is enforced. An `id` is a string an author types, so any pack can
  carry any publisher name and nothing records who wrote one. Guidance is the
  whole of what's available, which makes the deliverable
  [GOONPACKS.md](./GOONPACKS.md) rather than code: what each path is for, and
  the test for a variant that could be more than one of them.
