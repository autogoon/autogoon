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
- [8. Test it](#8-test-it)
- [9. Troubleshooting](#9-troubleshooting)
- [10. Releasing a new version](#10-releasing-a-new-version)

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

An overlay can't change **name** or **gender**. A pack that sets either is
rejected on import, naming the field to remove. Whichever overlay is on, it is
the same companion with the same conversation memory. If yours needs a different
name, make a complete pack.

An overlay's base must already be installed, and must be a complete pack — never
another overlay.

### 2. Make the folder

A pack is a folder holding at most three things:

    manifest.json     who they are — every pack
    system-prompt.md  their persona — every complete pack, optional on an overlay
    media/            pictures and videos, each with a .md file — optional

Nothing else. Any other file at the top of the folder, or any subfolder inside
`media/`, stops the import, and the error names it.

For a complete pack, the quickest start is to copy
[`goonpacks/elise/`](./goonpacks/elise/) and edit it. It is a working pack — the
companion these examples use — with all four `{{...}}` tokens already placed in
its persona. It carries no media, because the repo distributes none.

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
- **`aboutThePack`** — what the pack holds, shown on the Goonpacks tab, in the
  import confirmation and in the overlay picker. Leave out how many pictures and
  videos: the app counts them and shows the count beside your line.
- **`intro`** — the scene, shown at the top of the conversation. Required. See
  [step 4](#4-write-the-intro).
- **`mediaSummary`** — required if the pack ships media, and written for you by
  a script. See [step 6](#6-add-pictures-and-videos).
- **`recommendedModel`** — optional. The OpenRouter slug of the model you wrote
  the pack on. A persona is usually tuned to one model, so naming it tells the
  user which one you tested against. It appears on the companion's card as
  "Written for …", and is advice only: the model a companion runs on is chosen
  under **Settings → Companion model**, by whoever supplies the API key and pays
  for every reply.

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

`chattiness` and `playfulness` are how readily your companion speaks when the
user hasn't: chattiness while the toy is idle, playfulness while it is running.
Each sets the pause after your companion stops speaking, varied a little each
time within the range in brackets:

    value   chattiness (idle)   playfulness (in play)
    1       50s (25–60s)        25s (12.5–30s)
    2       40s (20–48s)        20s (10–24s)
    3       30s (15–36s)        15s (7.5–18s)
    4       20s (10–24s)        10s (5–12s)
    5       10s (5–12s)         5s (2.5–6s)

The pause is measured from when your companion stops speaking, so the silence
the user hears is longer by however long the next reply takes to generate.

`timezone` is where your companion is now, not where they are from. They are
given the date and time there, refreshed every turn and following daylight
saving, and told it is theirs and not the user's. They are never given the zone
name, so their whereabouts stay as vague as the persona leaves them.

`usesRealTime` is `false` when your persona fixes the time of day itself. A
persona opening "it's evening and you've just finished filming", against a
companion told it is 8am, leaves one of the two wrong.

`knowsUserTime` is `false` to withhold the time where the user is, which suits a
companion written to ask rather than assume. Left on, your companion is given
the user's local time and told to trust it over any hour the persona assumes.

**Don't recommend a MiniMax model** — anything under `minimax/`. The app sends
the current time, the toy's state, and the note marking an unanswered silence
after the conversation, so they are the newest thing your companion knows.
MiniMax models move all three in front of it: your companion then works from a
toy state that has since changed, and reads the silence as older than the last
thing said. Their thinking also comes back inside the reply, and is spoken aloud
in your companion's voice.

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
- **`noMedia`** — `true` leaves the companion none of the base's pictures and
  videos. Overlays only: a complete pack that sets it is refused, as is an
  overlay that sets it and ships `media/`. Leaving `media/` out keeps the base's
  set.

Everything else is **only what changes**: any `companion` field except `name`
and `gender`, `intro`, `recommendedModel`, `system-prompt.md`, and `media/` with
its own `mediaSummary`. What you leave out stays the base's.

Two things to watch:

- An overlay that rewrites the persona usually needs its own `intro`. Both
  describe the same scene, so changing one and not the other leaves the intro on
  screen contradicting what your companion says.
- An overlay that turns `usesRealTime` on needs a `timezone`, either its own or
  the one in the base version selected on the card. With neither, the overlay is
  greyed out and can't be picked.

### 4. Write the intro

The intro sets the scene the user arrives in. It is shown at the top of the
conversation, is never spoken, and never reaches the model, so nothing in it
instructs your companion.

Write only what the user already knows, which depends on the relationship: a
long-standing partner is familiar; a stranger the user has just paid to call is
a name, an age and what the call is for. What your companion is like is theirs
to show once they speak.

Leave out anything only your companion can see: what they're wearing, what their
room looks like, the weather where they are. Leave out that neither can see the
other, too — the session is voice, and the user knows it.

The persona describes the same scene from your companion's side. The two have to
agree.

The intro is JSON text, so a newline is written `\n` and a blank line `\n\n`. A
blank line starts a paragraph, and two paragraphs is usually enough.

### 5. Write the persona

`system-prompt.md` is your companion's persona, in plain English, written to
them ("You're 21, a painter…"). The model receives it as instructions. Cover:

- their character;
- their setting;
- how they talk;
- how they behave during play.

Say whether your companion leads or follows. The app does not set this.

**Do not name the device, or assume there is one.** Users have different
devices. `{{CONTROL_SECTION}}` tells your companion which device the user has
and what its settings are called.

**Do not write rules about who controls the toy.** `{{CONTROL_SECTION}}` sets
them for every companion:

- never start without the user asking;
- adjust freely once running;
- stop at any time.

If your persona contradicts those rules, the model receives both and may follow
your persona's. The user then loses control.

You can set how forward your companion is: one asks to start before the user
does, another waits to be told.

Four tokens are replaced by app-supplied sections wherever they appear in the
text:

- **`{{OUTPUT_FORMAT_SECTION}}`** — the reply format: speech only, no stage
  directions.
- **`{{SHARED_STYLE_BULLETS}}`** — baseline speaking-style bullets. Put the
  token under your own STYLE heading, with your companion's own bullets after
  it.
- **`{{CONTROL_SECTION}}`** — the toy rules. Include it once, above the part
  about how they behave during play.
- **`{{MEDIA_SECTION}}`** — how to search for and send pictures and videos. With
  media it includes your pack's `mediaSummary`; without media it tells your
  companion they have nothing to send.

You should always include all four tokens. A `system-prompt.md` with no
`{{MEDIA_SECTION}}` means the companion won't know how to send media.

The full text of every app-supplied section is in
[`shared-prompt.ts`](https://github.com/autogoon/autogoon/blob/main/src/lib/companions/shared-prompt.ts).

Some other information is added automatically to the conversation to give the
companion some context.

- The time where the companion is — when they have a `timezone`.
- The time where the user is — unless `knowsUserTime` is `false`.
- The toy's status (whether it's on, its speed etc.)
- Notes marking a gap or a silence, like "(3 hours pass.)".

### 6. Add pictures and videos

Optional. Files go directly in `media/`, with no subfolders.

- **Pictures:** `.jpg`, `.jpeg`, `.png`, `.webp`.
- **Videos:** `.mp4`, `.webm`.

`.mov` is rejected: it plays in Safari and unreliably everywhere else. Re-encode
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

A search matches its words against the caption and the description together, so
a word that appears only in the description still finds the item. Each hit comes
back with its caption, and your companion picks from those.

**A file with no sidecar never reaches your companion.** It isn't in the zip, a
pack read off disk leaves it out too, and it isn't in the count on their card. A
sidecar with no picture beside it, or a file in `media/` that isn't a picture or
video, is reported as a stray name and doesn't stop the import.

Names have to be exact in two ways: a sidecar's name must match its file's, case
included (`Beach.JPG` needs `Beach.md`), and no two media files may share a name
with different extensions (`beach.jpg` and `beach.mp4`), because the
conversation refers to them by name.

#### Writing the sidecars

A sidecar is a text file. Write it by hand, or start from a script's draft and
edit that.

    npm run goonpack:describe goonpacks/elise/media/beach.jpg
    npm run goonpack:describe-missing goonpacks/elise

The first describes one picture, the second every picture in that pack with no
sidecar yet, or every pack under `goonpacks/` when no folder is named. Both need
`OPENROUTER_API_KEY` in `.env` (see [`.env.example`](./.env.example)), run on
macOS only, and cost money — one LLM call per picture, so a set of a thousand is
a thousand calls. Neither touches videos, so video sidecars are always written
by hand.

`describe-missing` works in random order, so stopping a run early samples the
whole pack. Stop the first one after a few, read what it wrote, and fix anything
wrong before letting it finish.

#### Writing the mediaSummary

A pack with at least one described picture or video needs `mediaSummary` in its
manifest, or it won't import. Your companion is given this instead of a list of
every item, and uses it to judge what is worth offering and what words to search
with. Say what sorts of picture the set holds, roughly in what proportion, and
the words the captions use for them.

Write it yourself, or have it written from the sidecars the pack already has:

    npm run goonpack:summarise goonpacks/elise

That puts it into `manifest.json`, replacing any that is already there — so edit
it afterwards, not before. Either way, revisit it whenever the set changes.

### 7. Build the zip

**Running Autogoon from source, you can test the companion without zipping
anything.** Under `npm run dev`, every directory under `goonpacks/` with a
`manifest.json` is offered on the Companions screen. Edit the directory and
reload the page.

A directory whose `manifest.json` has no readable `id` and `version` doesn't
appear at all. One that has both and then fails validation is listed on the
Goonpacks tab as incompatible, with the reasons. These packs show `on disk`
where **Remove** would be — you remove one by deleting the directory. A
directory sharing an id and version with a pack you imported replaces it, and
the imported copy is deleted from browser storage, so keep your zip.

To give the pack to anyone else, zip it. Any zip tool works. Zip the folder's
**contents**, so `manifest.json` sits at the zip's root rather than inside a
folder. A zip with everything under one folder is refused, with the message
"Everything is inside `<folder>`/ — zip the folder's contents, not the folder."

If you're running the app from source, one command does it:

    npm run goonpack:build goonpacks/elise

It validates the pack with the app's own import checks and writes nothing if
that fails, listing every problem instead. What it writes is `manifest.json`,
`system-prompt.md`, and each media file that has a sidecar, with its sidecar.

Media with no sidecar, and files that aren't media, are left out; a warning
counts them and names the first few. The build checks what it will zip, not the
folder itself, so a hand-made zip carrying those files fails at import instead.
Anything involving another pack, such as whether an overlay's base is installed,
is only checked at import. The zip is `goonpacks/<folder>.zip`, named after the
folder rather than the pack id, so two folders can hold two versions of one
pack. Name no folder and it builds every pack under `goonpacks/`.

### 8. Test it

Open Autogoon — the hosted app at
[autogoon.vercel.app](https://autogoon.vercel.app/), or your own checkout — and
go to the Goonpacks tab → **Import pack** → choose the zip. The pack's card is
shown from its manifest before anything is written; confirm, and it unpacks with
a progress line. A failed import lists every problem, each with the file or
field it is in.

On the Companions screen, the companion's card carries two pickers: **Base**,
the pack version, newest first, shown when there is more than one; and
**Overlay**, `default` or any overlay installed for them. The card's
description, colour, media count and list of what the overlay changes all follow
what you pick.

Picking an overlay continues the conversation you were already having. Threads
belong to the companion, not to the pack you are playing them with.

### 9. Troubleshooting

- **The count on the card is lower than what's in `media/`.** Usually a file
  with no sidecar, or a sidecar whose name no longer matches its picture.
  Renaming one and not the other leaves both out.
- **The pack won't import.** Every problem is listed with the file or field it
  is in. Usually the zip has everything inside one folder, or the pack carries a
  stray file, or media with no `mediaSummary`, or a sidecar with no caption, or
  a `.mov`.
- **It imported, but isn't offered on the Companions screen.** It is on the
  Goonpacks tab marked incompatible, with the reason. An overlay whose base
  isn't installed is the usual one. Fix the cause and it comes back — every
  session re-checks the installed packs.
- **The overlay is greyed out.** It turns `usesRealTime` on and the base version
  it is paired with has no time zone. Give the overlay its own.
- **A `{{TOKEN}}` appears in what they say.** You misspelled it — only the four
  in [step 5](#5-write-the-persona) are recognised, and anything else is left in
  the prompt as written.
- **They never send pictures.** The persona has no `{{MEDIA_SECTION}}`, so they
  were never told how.
- **A picture in an older conversation shows a placeholder.** You are playing a
  different pack from the one that sent it. Media is a reference, not a copy;
  select that pack again and it's back.
- **The import says there isn't enough browser storage.** An import needs the
  pack's size plus 64 MB free. The message says how much is needed and how much
  there is.

### 10. Releasing a new version

If you want to change a pack you have given out, give `manifest.json` a new
`version`, keep the `id`, and build again.

A new version does not replace the old one. Each version imported gets its own
row on the Goonpacks tab, and the **Base** picker on the companion's card offers
them newest first.

Only importing that same `id` and `version` again overwrites an installed
version. The import confirmation shows this before anything is written: its
button reads **Replace** rather than **Import**, above the line "Replaces the
installed pack. Threads stay." The installed copy is deleted before the new one
is written.

Removing a version leaves its overlays installed. They list as incompatible only
once the last version of their base is gone.
