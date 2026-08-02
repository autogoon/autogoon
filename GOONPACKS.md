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

You don't need to be a developer to make one. A pack is at most three things,
zipped:

- a `manifest.json`, a few lines describing the pack;
- a `system-prompt.md`, their persona, written in plain English;
- a `media/` folder, if they send pictures or videos.

### Complete packs and overlays

**A complete pack** is a new companion, with everything they need to exist: a
name, a voice and a persona. Import it and they get their own card on the
Companions screen.

**An overlay** lets you tweak a companion someone already has — a built-in or an
imported complete pack — without changing who they are. It names its base
companion and includes only what changes; everything else stays the base's. An
overlay can replace their pictures and videos (or strip them, with `noMedia`),
their persona prompt, the scene it opens on, the model it runs, and any of their
[companion fields](#describing-the-companion).

What an overlay can never do is change their **name** or **gender**. An overlay
is still the same companion, keeping the same conversation memory whichever pack
it's played with. If your overlay renames them, that is a different companion;
make a complete pack.

Overlays always sit on a companion, never on another overlay.

### The files in a pack

Lay out a directory like this, then zip its **contents** (the manifest sits at
the zip root, not inside a folder):

    manifest.json       who they are — every field explained below
    system-prompt.md    their persona (complete packs; optional on overlays)
    media/              optional. Their pictures and videos, with a .md sidecar each

For a complete worked example, see [`goonpacks/elise/`](./goonpacks/elise/):
Elise as a complete pack, with a real manifest and a full persona prompt to crib
from. The pack ships with no media, since the repo never distributes imagery
(see the [content policy](./DEVELOPERS.md#content-policy)). Pictures and videos
are always yours to add.

### manifest.json — every field

The manifest is a small JSON file in two halves: the top level describes the
**pack** (what it is, its version), and the `companion` section describes
**them**. Text values go in quotes, numbers and true/false don't, and fields are
separated by commas:

    {
      "format": 1,
      "id": "yourname.luna",
      "version": "1.0.0",
      "aboutThePack": "Luna, a sleepy-voiced artist, complete with voice.",
      "intro": "Luna paints all night and answers her phone at 3am.\n\nYou have called her and she has picked up.",
      "companion": {
        "name": "Luna",
        "description": "A soft-spoken painter who stays up too late.",
        "gender": "female",
        "accentColour": "violet",
        "voiceId": "abc123...",
        "timezone": "America/New_York"
      }
    }

#### The fields every pack needs

Three of a pack's texts are easy to confuse, and each is read at a different
moment:

- **`aboutThePack`** — what the pack holds or changes, read on the Goonpacks tab
  when deciding whether to install it;
- **`description`** (in the companion section) — what your companion is like,
  read on their card when deciding whether to call them;
- **`intro`** — the scene, read at the top of the conversation once that choice
  is made.

The top level's own fields:

- **`format`** — always `1`.
- **`id`** — the pack's identity, as `publisher.packname`.
- **`version`** — your own version label, any text.
- **`aboutThePack`** — one line on what the pack adds or changes.
- **`intro`** — the scene the conversation opens on, above the first message.

`format` is the version of the _pack format_, not of your pack. A pack declaring
anything else is refused on import.

`id` is lowercase letters, numbers and hyphens either side of a single dot —
`g00ner.luna`, `my-packs.luna-beach` — and it is permanent. New versions of a
pack keep it, and for a complete pack it is what the companion's conversation
memory is tied to: if an update changes who they _are_, give it a new id.

`version` is shown exactly as written (`"1.0.0"`, `"2024-06"`, `"v2 final"`).
Versions install side by side and sort alphanumerically, newest first, so a
scheme that sorts is worth using.

`aboutThePack` is what the Goonpacks list and the import confirmation show:
"Beach photo set for Aimee", "Luna, complete with voice". Leave out what the
pack holds, counts included — the app reads that from the pack itself and shows
it, so a hand-written answer only goes stale.

`intro` is required on a complete pack; an overlay carries one only where it has
moved the scene. [Writing the intro](#writing-the-intro) says what belongs in
it.

#### Describing a media set

**`mediaSummary`** — what the media set holds, in one block of text. A pack that
carries media needs one.

Your companion is given this rather than a list of every item, so it should say
what sorts of picture are in the set, roughly in what proportion, and the words
the captions use for them. That is how they tell what's worth offering, and how
they ask for a picture in words the captions actually use.

Write it with `npm run goonpack:summarise`, which builds it from the pack's own
sidecars, and run that again whenever the set changes so it doesn't drift.

#### Setting the LLM model

All three sit at the top level, beside `id` and `version`: which model to run is
a decision about the pack, and an overlay that rewrites a persona often changes
it without changing who the companion is. All three are optional, and an overlay
that sets none keeps its base's.

- **`model`** — the OpenRouter model slug the conversation runs on.
- **`contextWindow`** — that model's context window, in tokens (a number, no
  quotes).
- **`passesReasoning`** — `true` for a reasoning model whose thinking should be
  replayed to it with the conversation.

Omit `model` and the pack runs on the app's default. Pick one that suits the
persona and allows the kind of roleplay you're writing: whether it will refuse,
and whether it calls tools reliably, are properties of the model rather than of
your prompt, so try one before settling on it. A model that stops calling tools
gives you a companion who talks about the toy without ever driving it.

`contextWindow` is only worth setting alongside `model`, and `passesReasoning`
only when you know the model needs it.

#### Describing the companion

Everything about the companion goes inside `companion: { … }`. For a **complete
pack**, `name`, `description`, `voiceId` and `timezone` are required (plus
`intro` at the top level and the `system-prompt.md` file next to the manifest);
the rest are optional. An **overlay** includes only the fields it changes.

- **`name`** — their name, as their card and picker show it.
- **`description`** — a sentence about _them_, for their card.
- **`gender`** — `female`, `male` or `nonbinary`.
- **`voiceId`** — the ElevenLabs voice they speak with.
- **`accentColour`** — the colour of their card and chooser entry: red, orange,
  amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet,
  purple, fuchsia, pink or rose. Pink if omitted.
- **`chattiness`** and **`playfulness`** — how readily they speak up when you
  haven't, from 1 to 5. Both 3 if omitted.
- **`timezone`** — where they are _now_, as an IANA zone name like
  `America/New_York` or `Europe/Riga`.
- **`usesRealTime`** — `false` if the persona sets its own time of day. `true`
  if omitted.
- **`knowsUserTime`** — `false` to withhold the time where _you_ are. `true` if
  omitted.

`name` and `gender` are forbidden on an overlay: it is the same companion.

`voiceId` is the voice's id string from ElevenLabs, and it must exist in the
ElevenLabs account the app runs with — voices don't travel between accounts.

`chattiness` applies while the toy is idle, `playfulness` while it's running.
Someone of few words can still keep up a filthy running commentary once things
are underway, and one setting couldn't say so. What each buys is the pause after
they finish speaking: a higher number is a shorter one, and in play every pause
is about half as long. Each is varied a little so the gap isn't the same twice,
leaning shorter rather than longer. The figure for every value is tabulated in
[ambient.ts](https://github.com/autogoon/autogoon/blob/main/src/lib/companions/ambient.ts),
beside the curves it comes from. They're measured from the moment the talking
stops, so the gap between turns is always longer than that; the next line still
has to be written and spoken first.

`timezone` is their location today, not where they're from — an overlay that
takes them somewhere else sets its own. They're told the real date and time in
that zone, refreshed every turn, and it follows daylight saving. What they're
told never names the place, only the clock, so a companion whose prompt keeps
their whereabouts vague stays vague. They're also told this is theirs and not
yours, and that you may be hours ahead or behind.

`usesRealTime` settles which wins when a persona has already fixed the hour. A
prompt opening "it's evening and you've just finished filming" and a companion
told it's 8am will either ignore you or ignore the prompt; turning the real
clock off is how you say which. The example pack's
[system-prompt.md](https://github.com/autogoon/autogoon/blob/main/goonpacks/elise/system-prompt.md)
is written that way — a late-night stream that's just wrapped.

`knowsUserTime` off suits a companion written as not knowing where you are: one
told to ask rather than assume, or who gives nothing away about place and time
themselves. Left on, they're told your local clock and to trust it over any hour
their setup assumes.

#### Making an overlay

- **`base`** (top level) — the `id` of the companion this overlay changes. It is
  what makes a pack an overlay.
- **`noMedia`** (top level) — `true` strips the base's pictures and videos.
- Everything else: **only what changes** — `media/`, `system-prompt.md`,
  `intro`, the model fields, and any `companion` fields.

`base` is a built-in's id or a complete pack's id, never another overlay's.

Each field the overlay sets replaces the base's while the overlay is selected,
and anything left out stays the base's. An overlay that rewrites the persona
usually wants its own `intro` too — the two describe the same scene, and one
changing without the other leaves them contradicting each other on screen.

`noMedia` is for when "none" is the point. Simply omitting `media/` keeps the
base's set.

`name` and `gender` are rejected outright — same companion, same memory (see
[Complete packs and overlays](#complete-packs-and-overlays)).

`timezone` is how an overlay moves a companion somewhere else. An overlay that
switches `usesRealTime` back on needs a zone from somewhere, and the base
version chosen in the card is where it looks: paired with one that has no zone,
the overlay can't be selected until it carries a zone of its own.

An overlay that changes only the companion's colour is just:

    {
      "format": 1,
      "id": "yourname.luna-cyan",
      "version": "1.0.0",
      "aboutThePack": "Luna in cyan.",
      "base": "yourname.luna",
      "companion": { "accentColour": "cyan" }
    }

### Pictures, videos and their sidecars

The companion's pictures and videos, directly in `media/` (no subfolders).

- **Pictures:** `.jpg`, `.jpeg`, `.png` or `.webp`.
- **Videos:** `.mp4` or `.webm`.

`.mov` is rejected: it plays in Safari and unreliably everywhere else, so a
`.mov` pack would work on your machine and not on someone else's. Re-encode it
as MP4.

Beside each one goes a `.md` sidecar with the same name (`beach.jpg` →
`beach.md`) holding two texts: a one-line caption in the frontmatter at the top,
and a longer description of the shot as the body under it. You rarely write one
by hand — see [Writing the sidecars](#writing-the-sidecars).

```markdown
---
caption: 'A woman on a beach at sunset, facing away from the camera.'
---

She stands at the waterline in a white summer dress, the hem wet. Behind her the
sun is low and the light is warm.
```

A search matches the request's words against the caption and the description
together. Each hit comes back with its caption, and the companion chooses from
those. A caption should say what's actually in the shot, and a word that appears
only in the description will still find the item.

**A file with no valid sidecar isn't part of the set.** The companion can't
search for it or send it, and it isn't in the count you see on their card.

A sidecar not written yet doesn't stop the pack building. The build says how
many are still waiting. One that is there but won't read — no caption, an empty
body, a misspelt field — refuses the whole pack, naming the file: that's a
description that went wrong rather than one not written yet.

A sidecar with no picture or video beside it is refused too. It means a rename
took one and left the other.

Two files can't share a name across types (`beach.jpg` and `beach.mp4`) — the
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
see the other, too — it's a phone call.

The persona prompt's setup describes the same scene from your companion's side,
so the two have to agree. Only the persona reaches the model; the intro is read
and never spoken, so nothing in it instructs your companion.

Newlines survive as written: a blank line makes a paragraph, and two is usually
enough.

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
`{{PLACEHOLDER}}` tokens: reply formatting, how the toy is driven, and how media
is sent. Put a token on its own line where that section should land:

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

Omit a token and that section is absent — a persona with no `{{MEDIA_SECTION}}`
never gets the instructions for sending. Misspell one and it stays in your
prompt as you typed it, which is how you'll spot it. The section texts live in
the app (`src/lib/companions/shared-prompt.ts`), so they stay current as the app
changes without packs having to.

Some rules need no token because they are appended for you. How a turn arrives,
and when to let a silence stand, goes on every persona. The rules for reading a
clock go with the clock they explain: your companion's own where they have one,
and yours unless `knowsUserTime` is off.

### Writing the sidecars

Three scripts write them for you, using your configured LLM. That means they
cost money — one call per picture, so a set of a thousand is a thousand calls —
and they need `OPENROUTER_API_KEY` in `.env` (see
[`.env.example`](./.env.example)). Point `describe-missing` at a handful first
and read what comes back before turning it loose on a whole set.

- `npm run goonpack:describe-missing` — every picture with no sidecar yet;
- `npm run goonpack:describe <path-to-image>` — one picture;
- `npm run goonpack:summarise` — the `mediaSummary`, from the sidecars a pack
  already has.

Videos are left alone; write their sidecars by hand.

`describe-missing`, `summarise` and `build` all take a pack directory to work on
just that pack, which is the order to do them in for a new one:

    npm run goonpack:describe-missing goonpacks/luna
    npm run goonpack:summarise goonpacks/luna
    npm run goonpack:build goonpacks/luna

### Building the zip

A pack holds three things and nothing else: `manifest.json`, `system-prompt.md`
and `media/`. Anything else in the zip — a leftover `notes.md`, a subfolder
inside `media/` — is refused on import, named so you can see which file it was.

Any zip tool works. Zip the directory's contents so `manifest.json` is at the
root. If you're running the app from source, `npm run goonpack:build` zips every
pack directory under `goonpacks/` to `goonpacks/<dir>.zip`, validating each one
first with the app's own import checks. A pack that builds is a pack that
imports. Name one to build just that pack:
`npm run goonpack:build goonpacks/elise`.

### Importing a pack and updating it

Goonpacks tab → **Import pack**. The pack's card is shown from its manifest
before anything is written, so you see what you're about to install. The unpack
runs once you confirm, with a progress line, and the installed row that follows
adds what the pack turned out to hold.

Versions install side by side; only re-importing the exact same id + version
replaces one. Each installed version lists on the Goonpacks tab with what it
brings. Remove takes out just that version, and conversation threads always
stay.

On the Companions screen, a companion's card carries the pack pickers: the
version (newest first, and the default) and an overlay to lay on top. The card's
description, colour and feature line follow what you've picked.

Every app load re-checks every stored pack against the current rules. A pack
that fails — its base was removed, or the pack format has moved on — stays on
the Goonpacks tab marked incompatible with the reasons, and isn't offered on the
chooser. Fix the cause, or re-import a corrected zip, and it comes back.

A sent picture or video stays in the conversation as a stable reference, not a
copy. It resolves against whichever pack is currently loaded. Switch away from
the pack it came from and it shows a terse placeholder rather than someone
else's; re-select the pack and it's back.
