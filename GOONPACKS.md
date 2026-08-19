# Goonpacks

## What a goonpack is

A **goonpack** is one companion in a zip file:

- who they are, and how they talk;
- their voice;
- their colour;
- optionally, their pictures and videos.

You import a pack on the app's Goonpacks tab, and they appear on the Companions
screen like any built-in. The app only ever imports packs. It never ships,
hosts, or points at them (see the
[content policy](./DEVELOPERS.md#content-policy)).

Importing **unpacks** the zip into your browser's storage. The zip itself isn't
kept, so keep your own copy. If the browser ever clears its storage the pack
goes with it, and importing the zip again brings it back.

### Complete packs and overlays

**A complete pack** is a new companion, with everything they need to exist: a
name, a voice and a persona. Import it and they get their own card on the
Companions screen.

**An overlay** lets you tweak a companion someone already has — a built-in or an
imported complete pack — without changing who they are. It names its base
companion and includes only what changes; everything else stays the base's.
[Making an overlay](#making-an-overlay) lists what it can replace.

What an overlay can never do is change their **name** or **gender**. An overlay
is still the same companion, keeping the same conversation memory whichever pack
it's played with. If your overlay renames them, that is a different companion;
make a complete pack.

### The files in a pack

Lay out a directory like this, then zip its **contents** (the manifest sits at
the zip root, not inside a folder):

- `manifest.json` — who they are, every field explained.
- `system-prompt.md` — their persona (complete packs; optional on overlays).
- `media/` — optional. Their pictures and videos, with a .md sidecar each.

[`goonpacks/elise/`](./goonpacks/elise/) is a complete pack you can open: Elise,
the companion these examples use, with her full manifest and a persona prompt to
crib from. It ships with no media, since the repo never distributes imagery (see
the [content policy](./DEVELOPERS.md#content-policy)).

### manifest.json — every field

The manifest is a small JSON file in two halves: the top level describes the
**pack** (what it is, its version), and the `companion` section describes
**them**. Text values go in quotes, numbers and true/false don't, and fields are
separated by commas:

    {
      "format": 1,
      "id": "g00ner.elise",
      "version": "3.0.0",
      "aboutThePack": "Elise, a flirty e-girl streamer.",
      "intro": "Elise streams as \"Vixen\" — 21, Latvian, Valorant most nights.\n\nShe has just come off a six-hour stream, and she has called you.",
      "companion": {
        "name": "Elise",
        "description": "A high-energy, flirty streamer with a dry, quieter side.",
        "gender": "female",
        "accentColour": "fuchsia",
        "voiceId": "abc123...",
        "usesRealTime": false
      }
    }

#### The fields every pack needs

The top level's own fields:

- **`format`** — always `1`.
- **`id`** — the pack's identity, as `publisher.packname`.
- **`version`** — your own version label, any text.
- **`aboutThePack`** — see [Describing the pack](#describing-the-pack).

`format` is the version of the _pack format_, not of your pack. A pack declaring
anything else is refused on import.

`id` is lowercase letters, numbers and hyphens either side of a single dot:
`g00ner.elise`, `my-packs.elise-beach`. It is permanent. New versions of a pack
keep it, and for a complete pack it is what the companion's conversation memory
is tied to. If an update changes who they _are_, give it a new id.

`version` is shown exactly as written (`"1.0.0"`, `"2024-06"`, `"v2 final"`).
The card's version picker offers them newest first. Digit runs compare as
numbers, so `1.10.0` is newer than `1.9.0`. Keep to one scheme across a pack's
versions and the order comes out right.

#### Describing the pack

Three of a pack's texts are read at different moments:

- **`aboutThePack`** — what the pack holds or changes, read on the Goonpacks tab
  and in the overlay picker when deciding what to install or choose;
- **`description`** (in the companion section) — what your companion is like,
  read on their card when deciding whether to call them;
- **`intro`** — the scene, read at the top of the conversation once that choice
  is made.

`aboutThePack` is what the Goonpacks list, the import confirmation and the
overlay picker show: "Beach photo set for Aimee", "Elise, a flirty e-girl
streamer". Leave out the inventory — how many pictures, how many videos. The app
counts those from the pack itself and shows them beside your line, and a
hand-written count goes stale.

`intro` is required on a complete pack. An overlay carries one only where it has
moved the scene. [Writing the intro](#writing-the-intro) says what belongs in
it.

#### Describing a media set

**`mediaSummary`** — what the media set holds, in one block of text. A pack that
carries media needs one.

Your companion is given this rather than a list of every item. It should say
what sorts of picture are in the set, roughly in what proportion, and the words
the captions use for them. That is how they tell what's worth offering, and what
words to search with.

Write it with `npm run goonpack:summarise`. Run that again whenever the set
changes.

#### Setting the LLM model

`model`, `contextWindow` and `passesReasoning` sit at the top level, beside `id`
and `version`. Which model to run is a decision about the pack, and an overlay
that rewrites a persona often changes it without changing who the companion is.
All three are optional, and an overlay that sets none keeps its base's.

- **`model`** — the OpenRouter model slug the conversation runs on.
- **`contextWindow`** — that model's context window, in tokens (a number, no
  quotes).
- **`passesReasoning`** — `true` for a reasoning model whose thinking should be
  replayed to it with the conversation.

Omit `model` and the pack runs on the app's default. Pick one that suits the
persona and allows the kind of roleplay you're writing. Whether it will refuse,
and whether it calls tools reliably, are properties of the model rather than of
your prompt. Try one before settling on it. A model that stops calling tools
gives you a companion who talks about the toy without ever driving it.

**Don't name a MiniMax model.** Anything under `minimax/` — M2.5, M3 — breaks
two things every companion depends on, and it is the model that does it rather
than any one provider serving it:

- The time and the state of the toy are sent at the end of every request, along
  with the nudge that tells your companion a silence has gone unanswered.
  MiniMax models move all three to the top, ahead of the conversation, so what
  should be the last thing they were told is the first. They answer with a stale
  idea of the toy, and a silence reads to them as no silence at all.
- Their thinking comes back inside the reply, wrapped in `<think>` tags, instead
  of separately. It is spoken aloud in their voice and kept in the transcript as
  something they said.

Set `contextWindow` and `passesReasoning` whenever you set `model`, and leave
all three out otherwise. A pack that sets `model` alone takes the app's defaults
for the other two; an overlay that sets `model` alone takes its base's. Either
way the window and the flag belong to a different model from the one running.

#### Describing the companion

Everything about the companion goes inside `companion: { … }`. An **overlay**
includes only the fields it changes. A **complete pack** needs the fields marked
required, plus `intro` at the top level and a `system-prompt.md` beside the
manifest.

- **`name`** (required) — their name, as their card and picker show it.
- **`description`** (required) — a sentence about _them_, for their card.
- **`gender`** — `female`, `male` or `nonbinary`. Female if omitted.
- **`voiceId`** (required) — the ElevenLabs voice they speak with.
- **`accentColour`** — the colour of their card and chooser entry: red, orange,
  amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet,
  purple, fuchsia, pink or rose. Pink if omitted.
- **`chattiness`** and **`playfulness`** — how readily they speak up when you
  haven't, from 1 to 5. Both 3 if omitted.
- **`timezone`** (required unless `usesRealTime` is `false`) — where they are
  _now_, as an IANA zone name like `America/New_York` or `Europe/Riga`.
- **`usesRealTime`** — `false` if the persona sets its own time of day. `true`
  if omitted.
- **`knowsUserTime`** — `false` to withhold the time where _you_ are. `true` if
  omitted.

`name` and `gender` are forbidden on an overlay: it is the same companion.

`voiceId` is the voice's id string from ElevenLabs. It must exist in the
ElevenLabs account the app runs with.

`chattiness` applies while the toy is idle, `playfulness` while it's running.
Someone of few words can still keep up a filthy running commentary once things
are underway, and one setting couldn't say so. Each sets the pause after they
finish speaking. A higher number is a shorter pause, and in play every pause is
about half as long. Each is varied a little, leaning shorter rather than longer,
so the gap isn't the same twice. The figure for every value is tabulated in
[ambient.ts](https://github.com/autogoon/autogoon/blob/main/src/lib/companions/ambient.ts),
beside the curves it comes from. They're measured from the moment the talking
stops. The gap between turns is always longer than that, because the next line
still has to be written and spoken first.

`timezone` is their location today, not where they're from. They're told the
real date and time in that zone, refreshed every turn, and it follows daylight
saving. What they're told never names the place, only the clock, so a companion
whose prompt keeps their whereabouts vague stays vague. They're also told this
is theirs and not yours, and that you may be hours ahead or behind.

`usesRealTime` settles which wins when a persona has already fixed the hour. A
prompt opening "it's evening and you've just finished filming" and a companion
told it's 8am will either ignore you or ignore the prompt. Turning the real
clock off is how you say which. Elise's
[system-prompt.md](https://github.com/autogoon/autogoon/blob/main/goonpacks/elise/system-prompt.md)
is written that way, on a late-night stream that's just wrapped.

`knowsUserTime` off suits a companion written as not knowing where you are: one
told to ask rather than assume, or who gives nothing away about place and time
themselves. Left on, they're told your local clock and to trust it over any hour
their setup assumes.

#### Making an overlay

- **`base`** (top level) — the `id` of the companion this overlay changes. It is
  what makes a pack an overlay.
- **`noMedia`** (top level) — `true` strips the base's pictures and videos.

Everything else an overlay carries is **only what changes**:

- `media/`, with its own `mediaSummary`;
- `system-prompt.md`;
- `intro`;
- the model fields;
- any `companion` field.

`base` is a built-in's id or a complete pack's id, never another overlay's.

Each field the overlay sets replaces the base's while the overlay is selected,
and anything left out stays the base's. An overlay that rewrites the persona
usually needs its own `intro` too. The two describe the same scene, and one
changing without the other leaves them contradicting each other on screen.

`noMedia` is for when "none" is the point. Omitting `media/` keeps the base's
set.

`name` and `gender` are rejected outright. Same companion, same memory (see
[Complete packs and overlays](#complete-packs-and-overlays)).

`timezone` is how an overlay moves a companion somewhere else. An overlay that
switches `usesRealTime` back on needs a zone from somewhere, and it comes from
the base version chosen in the card. Paired with one that has no zone, the
overlay can't be selected until it carries a zone of its own.

An overlay that changes only the companion's colour is:

    {
      "format": 1,
      "id": "yourname.elise-cyan",
      "version": "1.0.0",
      "aboutThePack": "Elise in cyan.",
      "base": "g00ner.elise",
      "companion": { "accentColour": "cyan" }
    }

### Pictures, videos and their sidecars

The companion's pictures and videos, directly in `media/` (no subfolders).

- **Pictures:** `.jpg`, `.jpeg`, `.png` or `.webp`.
- **Videos:** `.mp4` or `.webm`.

`.mov` is rejected: it plays in Safari and unreliably everywhere else. A `.mov`
pack would work on your machine and not on someone else's. Re-encode it as MP4.

Anything else in `media/` is left where it is. A file whose extension is none of
those above, and a sidecar whose picture has been renamed away, are counted in a
warning when the pack builds rather than refusing it. `media/` is a working
directory as often as it is a finished set, and another tool's files can sit
beside the pictures without breaking anything. Read the warning, though: a
mistyped extension lands in it looking exactly like another tool's working file.

Beside each one goes a `.md` sidecar with the same name (`beach.jpg` →
`beach.md`) holding two texts: a one-line caption in the frontmatter, and a
longer description of the shot as the body. You rarely write one by hand — see
[Writing the sidecars](#writing-the-sidecars).

```markdown
---
caption: 'A woman on a beach at sunset, facing away from the camera.'
---

She stands at the waterline in a white summer dress, the hem wet. Behind her the
sun is low and the light is warm.
```

A search matches the request's words against the caption and the description
together. Each hit comes back with its caption, and the companion chooses from
those. A caption should say what's in the shot, and a word that appears only in
the description will still find the item.

**A file with no sidecar yet isn't part of the set.** The companion can't search
for it or send it, and it isn't in the count you see on their card.

A sidecar not written yet doesn't stop the pack building. The build says how
many are still waiting. One that is there but won't read — no frontmatter, no
caption, an empty body — refuses the whole pack, naming the file. That is a
description that went wrong rather than one not written yet.

A sidecar with no picture or video beside it is counted in the same warning. It
means a rename took one and left the other.

Two files can't share a name across types (`beach.jpg` and `beach.mp4`). The
conversation refers to them by name, so one name means one thing.

## Creating a goonpack

### Writing the intro

The intro does two things:

- introduces your companion, as far as the player already knows them;
- sets the scene.

What the player knows comes from the relationship. A companion who is their
partner is someone they know well: warm, shy, quick to please all belong. A
companion they have just paid to call is a stranger — a name, an age and what
the call is for is all they have, and manner is the companion's own to show once
they speak.

Leave out anything only your companion can see: what they're wearing, what their
room looks like, the weather where they are. Leave out that neither of them can
see the other, too — the session is voice, and the player knows it.

The persona prompt's setup describes the same scene from your companion's side,
so the two have to agree. Only the persona reaches the model. The intro is read
and never spoken, so nothing in it instructs your companion.

Newlines are kept as written: a blank line starts a paragraph, and two
paragraphs is usually enough.

### Writing the persona

The system prompt is who the companion is, written in plain English:

- their character;
- their setting;
- how they talk;
- how they behave during play.

It's sent to the model as their instructions, so write it _to_ them ("You're 21,
a painter…").

Say **who leads between you** — whether they take charge or follow. The shared
sections leave that open on purpose, so a take-charge companion and a
let-you-drive one both work.

Control of the toy is not yours to set. The app settles that for everyone: never
started without your say-so, theirs to steer once it is running. Contradicting
it in a persona does not override it. Both texts reach the model in the same
prompt, so all you have done is made it choose, and the rule it might drop is
the one about consent.

**Don't name the device or assume there is one.** The app describes what he's
using, what it does to him and what its settings are called. A persona that says
"the toy", "the machine", or names a setting is written against one piece of
hardware, and reads wrong the day it's different hardware — or the day he has
none and is using his own hand.

**Say how your companion goes about it, in both cases.** This part _is_ yours,
and it is where a persona differs most from the next one: one is forward about
it and will ask for it before he offers, another hangs back and wants telling.
Direct that twice, because your companion cannot drive his hand:

- what they do when he has a toy they can drive — turning him up, holding him
  where they want him, following his lead;
- what they do when he has no device — what they tell him to do to himself, how
  fast, when to stop.

A companion who takes charge still takes charge with nothing connected; it comes
out as instructions he chooses to follow rather than as something they do to
him.

The app owns the mechanical rules as ready-made sections you pull in with
`{{PLACEHOLDER}}` tokens. Put a token on its own line where that section should
land:

- **`{{OUTPUT_FORMAT_SECTION}}`** — the reply-format rules (speech only, no
  stage directions). Include it in every persona.
- **`{{SHARED_STYLE_BULLETS}}`** — baseline speaking style bullets; put them
  under your own STYLE heading and add the companion's own after.
- **`{{CONTROL_SECTION}}`** — the full toy-control rules. Include it once,
  before the part of your persona describing how they behave during play: it is
  what tells them what he's using, so your own bullets can act on it.
- **`{{MEDIA_SECTION}}`** — how they search for and send pictures and videos.
  Safe to include either way. With media it carries your pack's own
  `mediaSummary`, which tells them what their set holds and so what there is to
  ask for. With none, it tells them they have nothing to send.

Omit a token and that section is absent. A persona with no `{{MEDIA_SECTION}}`
never gets the instructions for sending. Misspell one and it stays in your
prompt as you typed it, which is how you'll spot it. The section texts live in
the app (`src/lib/companions/shared-prompt.ts`), so they stay current as the app
changes without packs having to.

Some rules need no token because they are appended for you. How a turn arrives,
and when to let a silence stand, goes on every persona. The rules for reading a
clock go with the clock they explain: your companion's own where they have one,
and yours unless `knowsUserTime` is off.

### Writing the sidecars

Two scripts write them for you, one LLM call per picture — a set of a thousand
is a thousand calls. A third writes the pack's `mediaSummary`, in one call for
the whole set. All three cost money and need `OPENROUTER_API_KEY` in `.env` (see
[`.env.example`](./.env.example)). Point `describe-missing` at a handful first
and read what comes back before running it over a whole set.

- `npm run goonpack:describe-missing` — every picture with no sidecar yet;
- `npm run goonpack:describe <path-to-image>` — one picture;
- `npm run goonpack:summarise` — the `mediaSummary`, from the sidecars a pack
  already has.

Videos are left alone; write their sidecars by hand.

`describe-missing`, `summarise` and `build` all take a pack directory to work on
just that pack. That is the order to do them in for a new one:

    npm run goonpack:describe-missing goonpacks/elise
    npm run goonpack:summarise goonpacks/elise
    npm run goonpack:build goonpacks/elise

### Building the zip

A pack holds three things: `manifest.json`, `system-prompt.md` and `media/`.
Anything else at the zip's root — a leftover `notes.md` — is refused on import,
named so you can see which file it was, as is a subfolder inside `media/`. Files
sitting _inside_ `media/` that aren't media are warned about rather than
refused; see
[Pictures, videos and their sidecars](#pictures-videos-and-their-sidecars).

Any zip tool works. Zip the directory's contents so `manifest.json` is at the
root. If you're running the app from source, `npm run goonpack:build` writes
every pack directory under `goonpacks/` to `goonpacks/<dir>.zip`, validating
each one first with the app's own import checks.

It writes the manifest, the system prompt, and **the media that has a sidecar**.
A picture nothing describes is one no companion can pick, so it is left out and
counted in a warning rather than shipped. Anything else sitting in `media/` is
left out too. A name there that belongs to neither is named in a second warning.

### Importing a pack and updating it

Goonpacks tab → **Import pack**. The pack's card is shown from its manifest
before anything is written. The unpack runs once you confirm, with a progress
line, and the installed row that follows adds what the pack turned out to hold.

Versions install side by side; only re-importing the exact same id + version
replaces one. Each installed version lists on the Goonpacks tab with what it
brings. Remove takes out just that version, and conversation threads always
stay.

On the Companions screen, a companion's card carries the pack pickers: the
version (newest first, and the default) and an overlay to lay on top. The card's
description, colour and feature line follow what you've picked.

Every session re-checks every stored pack against the current rules, the first
time you open Companions or Goonpacks. A pack that fails — its base was removed,
or the pack format has moved on — stays on the Goonpacks tab marked incompatible
with the reasons, and isn't offered on the chooser. Fix the cause, or re-import
a corrected zip, and it comes back.

A sent picture or video stays in the conversation as a stable reference, not a
copy. It resolves against whichever pack is currently loaded. Switch away from
the pack it came from and it shows a terse placeholder rather than someone
else's; re-select the pack and it's back.
