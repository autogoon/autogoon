# Goonpacks

## What is a goonpack?

A goonpack is one companion in a zip file: who they are, their voice, and
optionally their pictures and videos.

Import one on the app's Goonpacks tab and they appear on the Companions screen
with the built-ins. Importing unpacks the zip into your browser's storage; the
zip itself isn't kept. Keep your own copy — if the browser clears its storage,
the pack goes with it, and importing the zip again brings it back.

The app only imports packs. It never ships, hosts or points at them (see the
[content policy](./DEVELOPERS.md#content-policy)).

## Creating a goonpack

- [1. Decide what you're making](#1-decide-what-youre-making)
- [2. Make the folder](#2-make-the-folder)
- [3. Write manifest.json](#3-write-manifestjson)
- [4. Write the intro](#4-write-the-intro)
- [5. Write the persona](#5-write-the-persona)
- [6. Add pictures and videos](#6-add-pictures-and-videos)
- [7. Build the zip](#7-build-the-zip)
- [8. Import it](#8-import-it)
- [9. Release a new version](#9-release-a-new-version)

### 1. Decide what you're making

**A complete pack** is a new companion: a name, a voice, a persona and an intro.
It gets its own card on the Companions screen.

**An overlay** changes a companion you already have — a built-in, or an imported
complete pack. It names its base and carries only what differs. An overlay can
replace:

- the persona;
- the intro;
- the voice, colour and description;
- chattiness, playfulness, time zone and the clock settings;
- the recommended model;
- the pictures and videos.

An overlay can't change **name** or **gender**; both are rejected. It is the
same companion, keeping the same conversation memory whichever overlay is on. If
yours renames them, make a complete pack.

An overlay's base must already be installed, and must be a complete pack — never
another overlay.

### 2. Make the folder

A pack is a folder holding at most three things:

    manifest.json     who they are — every pack
    system-prompt.md  their persona — every complete pack, optional on an overlay
    media/            pictures and videos, each with a .md file — optional

Nothing else. Any other file, and any subfolder inside `media/`, is rejected on
import and named.

[`goonpacks/elise/`](./goonpacks/elise/) is a complete pack to read: Elise, the
companion these examples use, with her manifest and persona. It carries no
media, because the repo distributes none.

### 3. Write manifest.json

JSON: text in double quotes, numbers and `true`/`false` without, a comma between
fields and none after the last.

#### A complete pack's manifest

    {
      "format": 1,
      "id": "g00ner.elise",
      "version": "3.0.0",
      "aboutThePack": "Elise, a flirty e-girl streamer.",
      "intro": "Elise streams as \"Vixen\" — 21, Latvian, Valorant most nights.\n\nShe has just come off a six-hour stream, and she has called you.",
      "recommendedModel": "...",
      "companion": {
        "name": "Elise",
        "description": "A high-energy, flirty streamer with a dry, quieter side.",
        "gender": "female",
        "voiceId": "abc123...",
        "accentColour": "fuchsia",
        "chattiness": 4,
        "playfulness": 5,
        "timezone": "Europe/Riga",
        "usesRealTime": true,
        "knowsUserTime": true
      }
    }

The top level:

- **`format`** — always `1`. This is the version of the pack format, not of your
  pack. Anything else is refused on import.
- **`id`** — `publisher.packname`, in lowercase letters, numbers and hyphens
  either side of one dot. It is permanent: new versions keep it, and the
  companion's conversation memory is tied to it. It can't be a built-in
  companion's id. If an update changes who they _are_, use a new id.
- **`version`** — any text, shown exactly as written (`"1.0.0"`, `"2024-06"`,
  `"v2 final"`). The picker offers versions newest first, comparing digit runs
  as numbers, so `1.10.0` is newer than `1.9.0`. Keep one scheme across a pack's
  versions.
- **`aboutThePack`** — what the pack holds, read on the Goonpacks tab, in the
  import confirmation and in the overlay picker. Leave out how many pictures and
  videos: the app counts them and shows them beside your line.
- **`intro`** — the scene, read at the top of the conversation. Required. See
  [step 4](#4-write-the-intro).
- **`mediaSummary`** — required if the pack ships media, and written for you by
  a script. See [step 6](#6-add-pictures-and-videos).
- **`recommendedModel`** — optional. The OpenRouter slug of the model you wrote
  the pack on. A persona is usually tuned to one model, so naming it tells the
  player what gives your pack its best showing. It appears on their card as
  "Written for …", and is advisory: the model a companion actually runs on is
  chosen under **Settings → Companion model**, because whoever supplies the API
  key pays for every reply.

Inside `companion`:

- **`name`** (required) — as their card and the pickers show it.
- **`description`** (required) — a sentence about _them_, for their card.
- **`voiceId`** (required) — the ElevenLabs voice id. It must exist in the
  ElevenLabs account the app runs with.
- **`timezone`** (required unless `usesRealTime` is `false`) — an IANA zone name
  like `Europe/Riga` or `America/New_York`.
- **`gender`** — `female`, `male` or `nonbinary`. `female` if omitted.
- **`accentColour`** — their card's colour: `red`, `orange`, `amber`, `yellow`,
  `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`,
  `purple`, `fuchsia`, `pink` or `rose`. `pink` if omitted.
- **`chattiness`** and **`playfulness`** — whole numbers from 1 to 5. `3` if
  omitted.
- **`usesRealTime`** — `true` if omitted.
- **`knowsUserTime`** — `true` if omitted.

`chattiness` and `playfulness` are how readily they speak when you haven't:
chattiness while the toy is idle, playfulness while it's running. Someone of few
words can still keep up a filthy commentary once things are underway. Each sets
the pause after they finish speaking — a higher number is a shorter pause,
halved again in play, and varied a little each time. The figure for every value
is in
[ambient.ts](https://github.com/autogoon/autogoon/blob/main/src/lib/companions/ambient.ts).

`timezone` is where they are today, not where they're from. They're told the
date and time there, refreshed every turn and following daylight saving, and
told it is theirs and not yours. The place itself is never named, so a companion
whose persona keeps their whereabouts vague stays vague.

`usesRealTime` is `false` when the persona fixes the hour itself. A prompt
opening "it's evening and you've just finished filming", against a companion
told it's 8am, makes one of the two wrong.

`knowsUserTime` is `false` to withhold the time where _you_ are. It suits a
companion written to ask rather than assume. Left on, they're told your local
clock and to trust it.

**Don't recommend a MiniMax model** — anything under `minimax/`. They move the
time and the toy's state to the top of the request, ahead of the conversation,
so your companion acts on a stale idea of the toy and can't tell that a silence
went unanswered. Their thinking also comes back inside the reply, and is spoken
aloud in their voice.

#### An overlay's manifest

    {
      "format": 1,
      "id": "yourname.elise-cyan",
      "version": "1.0.0",
      "aboutThePack": "Elise in cyan.",
      "base": "g00ner.elise",
      "companion": { "accentColour": "cyan" }
    }

`format`, `id`, `version` and `aboutThePack` are required and work as above. Two
fields are the overlay's own:

- **`base`** — the `id` of the companion this changes. Its presence is what
  makes a pack an overlay. It must be a complete pack's id, and can't be the
  overlay's own.
- **`noMedia`** — `true` strips the base's pictures and videos, for when "none"
  is the point. Overlay only; a complete pack setting it is refused, as is
  `noMedia` alongside a `media/` folder. Leaving `media/` out keeps the base's
  set.

Everything else is **only what changes**: any `companion` field except `name`
and `gender`, `intro`, `recommendedModel`, `system-prompt.md`, and `media/` with
its own `mediaSummary`. What you leave out stays the base's.

Two things to watch:

- An overlay that rewrites the persona usually needs its own `intro`. The two
  describe the same scene, and one moving without the other leaves them
  contradicting each other on screen.
- An overlay that switches `usesRealTime` back on needs a time zone from
  somewhere — its own, or the base version selected on the card. Paired with a
  base that has none, it can't be selected.

### 4. Write the intro

The intro introduces your companion and sets the scene. It is shown at the top
of the conversation and never spoken, and it never reaches the model, so nothing
in it instructs your companion.

Write only what the player already knows. A partner is someone they know well:
warm, shy, quick to please all belong. A stranger they have just paid to call is
a name, an age and what the call is for — manner is the companion's own to show
once they speak.

Leave out anything only your companion can see: what they're wearing, what their
room looks like, the weather where they are. Leave out that neither can see the
other, too — the session is voice, and the player knows it.

The persona describes the same scene from your companion's side. The two have to
agree.

Newlines are kept as written. A blank line starts a paragraph, and two
paragraphs is usually enough.

### 5. Write the persona

`system-prompt.md` is who your companion is, in plain English, written _to_ them
("You're 21, a painter…"). It is sent to the model as their instructions. Cover:

- their character;
- their setting;
- how they talk;
- how they behave during play.

Say **who leads** — whether they take charge or follow. The app's own sections
leave that open on purpose.

**Don't name the device, or assume there is one.** `{{CONTROL_SECTION}}` tells
your companion what the player is using and what its settings are called. A
persona that names hardware reads wrong the day it's different hardware.

**Don't set who controls it.** The app settles that for everyone: never started
without the player's say-so, your companion's to steer once it is running.
Contradicting it in a persona doesn't override it — both texts reach the model
together, so all you have done is make it choose, and the rule it might drop is
the one about consent. What is yours is how forward your companion is about it:
one asks before he offers, another hangs back and wants telling.

The app owns the mechanical rules as ready-made sections. Put a token on its own
line where that section should land:

- **`{{OUTPUT_FORMAT_SECTION}}`** — the reply format: speech only, no stage
  directions. Include it in every persona.
- **`{{SHARED_STYLE_BULLETS}}`** — baseline speaking-style bullets. Put them
  under your own STYLE heading and add your companion's own after.
- **`{{CONTROL_SECTION}}`** — the toy rules. Include it once, before the part of
  your persona describing how they behave during play, which depends on it.
- **`{{MEDIA_SECTION}}`** — how they search for and send pictures and videos.
  Include it either way: with media it carries your pack's `mediaSummary`, and
  with none it tells them they have nothing to send.

Omit a token and that section is absent — a persona with no `{{MEDIA_SECTION}}`
never gets the instructions for sending. Misspell one and it stays in your
prompt as you typed it, which is how you'll spot it.

Three sections need no token, because they are added for you: how a turn arrives
and when to let a silence stand; your companion's clock, where they have a time
zone; and yours, unless `knowsUserTime` is off.

### 6. Add pictures and videos

Optional. Files go directly in `media/`, with no subfolders.

- **Pictures:** `.jpg`, `.jpeg`, `.png`, `.webp`.
- **Videos:** `.mp4`, `.webm`.

`.mov` is rejected by name: it plays in Safari and unreliably everywhere else,
so a `.mov` pack would work on your machine and not on someone else's. Re-encode
it as MP4.

Each file needs a `.md` sidecar of the same name (`beach.jpg` → `beach.md`): a
one-line caption in the frontmatter, and a longer description as the body.

```markdown
---
caption: 'A woman on a beach at sunset, topless, facing the camera.'
---

She stands at the waterline in a white summer dress pulled down to her waist,
the wet hem clinging to her thighs. Her breasts are bare and her hair is stuck
to her shoulders. She is looking straight into the lens. Behind her the sun is
low and the light is warm.
```

A search matches the request's words against the caption and the description
together, and each hit comes back with its caption for your companion to choose
from. A word that appears only in the description still finds the item.

**A file with no sidecar never reaches your companion.** The build leaves it out
of the zip, and a pack loaded straight from disk leaves it out of the set. Your
companion can't search for it or send it, and it isn't in the count on their
card.

Three more rules:

- A sidecar that is there but won't read — no frontmatter, no caption, an empty
  body — refuses the whole pack, naming the file. That is a description that
  went wrong, not one not written yet.
- A sidecar whose picture has been renamed away is counted in a warning when the
  pack builds, as is a file whose extension is none of those above. `media/` is
  a working folder as often as a finished set, and another tool's files can sit
  there. Read the warning, though: a mistyped extension looks exactly the same.
- Two files can't share a name across types (`beach.jpg` and `beach.mp4`). The
  conversation refers to them by name, so one name means one thing.

#### Writing the sidecars

A sidecar is a text file. Write it by hand, or start from a script's draft and
edit that.

    npm run goonpack:describe goonpacks/elise/media/beach.jpg
    npm run goonpack:describe-missing goonpacks/elise

The first describes one picture, the second every picture in that pack with no
sidecar yet. Both cost money — one LLM call per picture, so a set of a thousand
is a thousand calls — need `OPENROUTER_API_KEY` in `.env` (see
[`.env.example`](./.env.example)), and run on macOS only. Videos are skipped
either way, so theirs are always by hand. Point `describe-missing` at a handful
first, read what comes back, and rewrite anything that isn't right.

#### Writing the mediaSummary

A pack that ships media needs `mediaSummary` in its manifest, or it won't
import. Your companion is given this rather than a list of every item. It should
say what sorts of picture the set holds, roughly in what proportion, and the
words the captions use for them — that is how they tell what's worth offering,
and what to search with.

Write it yourself, or have it written from the sidecars the pack already has:

    npm run goonpack:summarise goonpacks/elise

That puts it into `manifest.json`, replacing any that is already there — so edit
it afterwards, not before. Either way, revisit it whenever the set changes.

### 7. Build the zip

**Running Autogoon from source, you can test the companion without zipping
anything.** Under `npm run dev`, every directory under `goonpacks/` with a
`manifest.json` is offered on the Companions screen as it sits. Edit the
directory, reload the page, and that is the whole loop.

A directory the app can't read an id and version from doesn't appear at all. One
that names itself and then fails validation lists on the Goonpacks tab as
incompatible, with the reasons. These packs show `on disk` where **Remove**
would be — you remove one by deleting the directory. A directory sharing an id
and version with a pack you imported replaces it, and the imported copy is
deleted from browser storage, so keep your zip.

To give the pack to anyone else, zip it. Any zip tool works. Zip the folder's
**contents**, so `manifest.json` sits at the zip's root rather than inside a
folder. (A zip with everything under one folder is refused, saying exactly
that.)

If you're running the app from source, one command does it:

    npm run goonpack:build goonpacks/elise

It validates the pack with the app's own import checks and writes nothing if
that fails, listing every problem instead. What it writes is `manifest.json`,
`system-prompt.md`, and each media file that has a sidecar, with its sidecar.

Everything else is left out, and counted in a warning naming the first few:
media with no sidecar, and files that aren't media at all. The zip is
`goonpacks/<folder>.zip`, named after the folder rather than the pack id, so two
folders can hold two versions of one pack. Name no folder and it builds every
pack under `goonpacks/`.

### 8. Import it

Open Autogoon — the hosted app at
[autogoon.vercel.app](https://autogoon.vercel.app/), or your own checkout — and
go to the Goonpacks tab → **Import pack** → choose the zip. The pack's card is
shown from its manifest before anything is written; confirm, and it unpacks with
a progress line. A pack that fails lists each problem with the file or field it
is in.

On the Companions screen, the companion's card carries the pickers: **Base**,
the pack version, newest first, shown when there is more than one; and
**Overlay**, which is `default` or any overlay installed for them. The card's
description, colour and feature line follow what you pick. An overlay the
selected base leaves without a time zone is greyed out.

Picking an overlay continues the conversation you were already having. Threads
belong to the companion, not to the pack you are playing them with.

### 9. Release a new version

Change what you want, give `manifest.json` a new `version`, keep the `id`, then
build and import again.

Versions install side by side, each with its own row on the Goonpacks tab. Only
re-importing the same id _and_ version replaces one, and the confirmation says
so before it does. Conversation threads always stay.

**Remove** takes out one version. It never cascades: overlays of a base you
removed stay installed and list as incompatible until it's back.

Every session re-checks every installed pack the first time you open Companions
or Goonpacks. One that fails — its base is gone, or the pack format has moved on
— stays on the Goonpacks tab marked incompatible with the reasons, and isn't
offered on the Companions screen. Fix the cause, or import a corrected zip, and
it comes back.

A picture or video already sent stays in the conversation as a reference, not a
copy, and resolves against whichever pack is selected. Switch away from the pack
it came from and it shows a placeholder rather than someone else's; select that
pack again and it's back.
