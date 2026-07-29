# Goonpacks

A **goonpack** is one companion in a zip file: who they are, how they talk,
their voice, their colour, and (optionally) their pictures and videos. You
import a pack on the app's Goonpacks tab, and they appear on the Companions
screen like any built-in. The app only ever imports packs — it never ships,
hosts, or points at them (see the
[content policy](./DEVELOPERS.md#content-policy)).

Importing **unpacks** the zip into your browser's storage; the zip itself isn't
kept, so keep your own copy. If the browser ever clears its storage the pack
goes with it, and importing the zip again brings it back.

You don't need to be a developer to make one. A pack is at most three things,
zipped: a `manifest.json` (a few lines describing the pack), a
`system-prompt.md` (their persona, written in plain English), and a `media/`
folder if they send pictures or videos.

## The two kinds of pack

**A complete pack** is a new companion — everything they need to exist: a name,
a voice, a persona. Import it and they get their own card on the Companions
screen.

**An overlay** is _your version_ of a companion you already have — a built-in or
an imported complete pack. It names its base companion and includes only what
changes; everything else stays the base's. An overlay can replace their pictures
and videos (or strip them, with `noMedia`), their persona prompt, and any of
their [companion fields](#the-companion-section--their-fields).

What an overlay can never do is change their **name** or **gender**. An overlay
is still the same companion — they keep the same conversation memory whichever
pack you play them with. If your version renames them, that's a different
companion: make a complete pack.

Overlays always sit on a companion, never on another overlay.

## Assembling a pack

Lay out a directory like this, then zip its **contents** (the manifest sits at
the zip root, not inside a folder):

    manifest.json       who they are — every field explained below
    system-prompt.md    their persona (complete packs; optional on overlays)
    media/              optional. Their pictures and videos, with a .md sidecar each

For a complete worked example, see [`goonpacks/elise/`](./goonpacks/elise/) —
Elise as a complete pack: a real manifest and a full persona prompt to crib
from. The pack ships with no media; the repo never distributes imagery (see the
[content policy](./DEVELOPERS.md#content-policy)) — pictures and videos are
always yours to add.

## manifest.json — every field

The manifest is a small JSON file in two halves: the top level describes the
**pack** (what it is, its version), and the `companion` section describes
**them**. Text values go in quotes, numbers and true/false don't, and fields are
separated by commas:

    {
      "format": 1,
      "id": "yourname.luna",
      "version": "1.0.0",
      "aboutThePack": "Luna, a sleepy-voiced artist, complete with voice.",
      "companion": {
        "name": "Luna",
        "description": "A soft-spoken painter who stays up too late.",
        "gender": "female",
        "accentColour": "violet",
        "voiceId": "abc123..."
      }
    }

### Every pack needs

- **`format`** — always `1`. This is the version of the _pack format_, not the
  version of your pack. A pack declaring anything else is refused on import.
- **`id`** — the pack's identity, as `publisher.packname`: your publisher name,
  a dot, the pack name — lowercase letters, numbers and hyphens only
  (`g00ner.luna`, `my-packs.luna-beach`). The id is permanent: new versions of a
  pack keep the same id, and for a complete pack the id is what the companion's
  conversation memory is tied to. If an update changes who they _are_, that's a
  new companion — give it a new id.
- **`version`** — your own version label, any text, shown as it's written
  (`"1.0.0"`, `"2024-06"`, `"v2 final"`). Versions of a pack install side by
  side and sort alphanumerically, newest first — so a versioning scheme that
  sorts (like `1.0.0`, `1.0.1`, `1.1.0`) is worth using.
- **`aboutThePack`** — one line about what the _pack_ adds or changes ("Beach
  photo set for Aimee", "Luna, complete with voice"). This is about the pack,
  not the companion — it's what the Goonpacks list and the import confirmation
  show. Their own blurb goes in `description`. Leave what the pack holds out of
  it — counts, or that it has none: the app works that out from the pack itself
  and shows it, so anything hand-written there is a second answer waiting to go
  stale.

### A pack with media also needs

- **`mediaSummary`** — what the media set holds, in one block of text: the sorts
  of picture in it, roughly in what proportion, and the words the captions use
  for them. Your companion is given this rather than a list of every item, so
  they can tell what's worth offering, and ask for a picture in words the
  captions actually use. A pack that carries media needs one — write it with
  `npm run goonpack:summarise`, which builds it from the pack's own sidecars,
  and run that again whenever the set changes so it doesn't drift.

### The companion section — their fields

Everything about the companion goes inside `companion: { … }`. For a **complete
pack**, `name` and `voiceId` are required (plus the `system-prompt.md` file next
to the manifest); the rest are optional. An **overlay** includes only the fields
it changes.

- **`name`** — their name, as their card and picker show it. Required on a
  complete pack; forbidden on an overlay.
- **`voiceId`** — the ElevenLabs voice they speak with. This is the voice's id
  string from ElevenLabs, and it must exist in the ElevenLabs account the app
  runs with — voices don't travel between accounts. Required on a complete pack.
- **`gender`** — `female`, `male` or `nonbinary`. Optional; forbidden on an
  overlay.
- **`description`** — a sentence about _them_, shown on their card on the
  Companions screen. Optional.
- **`accentColour`** — the colour of their card and chooser entry. One of: red,
  orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo,
  violet, purple, fuchsia, pink, rose. Optional (pink if omitted).
- **`model`** — the OpenRouter model they run on, as a model slug. Optional; the
  app's default model when omitted. Pick a model that suits their persona — and
  that allows the kind of roleplay you're writing. Whether it will refuse, and
  whether it calls tools reliably, are both properties of the model rather than
  of your prompt, so try one before settling on it: a model that stops calling
  tools gives you a companion who talks about the toy without ever driving it.
- **`contextWindow`** — the chosen model's context window, in tokens (a number,
  no quotes). Optional; only worth setting alongside `model`.
- **`passesReasoning`** — `true` if the chosen model is a reasoning model whose
  thinking should be replayed to it with the conversation. Optional; leave it
  out unless you know the model needs it.
- **`chattiness`** and **`playfulness`** — how readily your companion speaks up
  when you haven't, from 1 to 5. Both optional, 3 if omitted. `chattiness`
  applies while the toy is idle, `playfulness` while it's running: someone of
  few words can still keep up a filthy running commentary once things are
  underway, and one setting couldn't say so.

  What each buys is the pause after they finish speaking: a higher number is a
  shorter one, and in play every pause is about half as long. Each is varied a
  little so the gap isn't the same twice, leaning shorter rather than longer.
  The figure for every value is tabulated in
  [ambient.ts](https://github.com/autogoon/autogoon/blob/main/src/lib/companions/ambient.ts),
  beside the curves it comes from. They're measured from the moment the talking
  stops, so the gap between turns is always longer than that: the next line
  still has to be written and spoken first.

### Overlays

- **`base`** (top-level; this is what makes a pack an overlay) — the `id` of the
  companion this overlay changes: a built-in's id or a complete pack's id, never
  another overlay's.
- Then include **only what changes**: `media/`, `system-prompt.md`, and any
  `companion` fields — each one replaces the base's while the overlay is
  selected; anything left out stays the base's.
- **`noMedia`** (top-level) — `true` means the overlay deliberately strips the
  base's pictures and videos, so the combination has none. (Simply omitting
  `media/` keeps the base's set — `noMedia` is for when "none" is the point.)
- **`name`** and **`gender`** are rejected on overlays — same companion, same
  memory (see [The two kinds of pack](#the-two-kinds-of-pack)).

An overlay that changes only the companion's colour is just:

    {
      "format": 1,
      "id": "yourname.luna-cyan",
      "version": "1.0.0",
      "aboutThePack": "Luna in cyan.",
      "base": "yourname.luna",
      "companion": { "accentColour": "cyan" }
    }

## system-prompt.md — their persona

The system prompt is who the companion is, written in plain English: their
character, their setting, how they talk, how they behave during play. It's sent
to the model as their instructions, so write it _to_ them ("You're 21, a
painter…").

Say **who leads between you** — whether they take charge or follow. The shared
sections leave that open on purpose, so a take-charge companion and a
let-you-drive one both work.

Control of the toy is not yours to set. The app settles that for everyone: never
started without your say-so, theirs to steer once it is running. Contradicting
it in a persona does not override it; both texts reach the model in the same
prompt, so all you have done is made it choose — and the rule it might drop is
the one about consent.

The app owns the mechanical rules — reply formatting, how the toy is driven, how
media is sent — as ready-made sections you pull in with `{{PLACEHOLDER}}`
tokens. Put a token on its own line where that section should land:

- **`{{OUTPUT_FORMAT_SECTION}}`** — the reply-format rules (speech only, no
  stage directions). Include it in every persona.
- **`{{SHARED_STYLE_BULLETS}}`** — baseline speaking style bullets; put them
  under your own STYLE heading and add the companion's own after.
- **`{{CONTROL_SUMMARY_SECTION}}`** — a short "you control the toy" summary for
  mid-persona placement.
- **`{{CONTROL_SECTION}}`** — the full toy-control rules. Include it once, near
  the end.
- **`{{MEDIA_SECTION}}`** — how they search for and send pictures and videos.
  Safe to include either way: with media it carries your pack's own
  `mediaSummary`, which is what tells them what their set holds and so what
  there is to ask for; with none it tells them they have nothing to send.

Omit a token and that section is absent — a persona with no `{{MEDIA_SECTION}}`
never gets the instructions for sending. Misspell one and it stays in your
prompt as you typed it, which is how you'll spot it. The section texts live in
the app (`src/lib/companions/shared-prompt.ts`), so they stay current as the app
changes without packs having to.

One set of rules needs no token and can't be left out: your companion is always
told the real date and time where _you_ are, so the rules for reading that are
added to every persona automatically.

## media/

The companion's pictures and videos, directly in `media/` (no subfolders).

- **Pictures:** `.jpg`, `.jpeg`, `.png` or `.webp`.
- **Videos:** `.mp4` or `.webm`. `.mov` is rejected — it plays in Safari and
  unreliably everywhere else, so a `.mov` pack would work on your machine and
  not on someone else's. Re-encode it as MP4.

Beside each one goes a `.md` sidecar with the same name (`beach.jpg` →
`beach.md`) holding two texts: a one-line caption in the frontmatter at the top,
and a longer description of the shot as the body under it.

```markdown
---
caption: 'A woman on a beach at sunset, facing away from the camera.'
---

She stands at the waterline in a white summer dress, the hem wet. Behind her the
sun is low and the light is warm.
```

A search matches the request's words against the caption and the description
together; each hit comes back with its caption, and the companion chooses from
those. So a caption should say what's actually in the shot, and a word that
appears only in the description will still find the item.

`npm run goonpack:describe` writes both, so there's rarely a reason to type one
by hand — see [Building the zip](#building-the-zip). **The sidecar is what makes
a file part of the set**: a picture with no sidecar yet doesn't stop the pack
building, but it isn't one of your companion's pictures either — they can't
search for it or send it, and it isn't in the count you see on their card. The
build says how many are still waiting. A sidecar that _is_ there has to be
readable, though — one with no caption, an empty body, or a misspelt field is
refused, naming the file, because that's a description that went wrong rather
than one not written yet.

A sidecar with no picture or video beside it is refused too: it means a rename
took one and left the other.

Two files can't share a name across types (`beach.jpg` and `beach.mp4`) — the
conversation refers to them by name, so one name means one thing.

## Building the zip

A pack holds three things and nothing else: `manifest.json`, `system-prompt.md`
and `media/`. Anything else in the zip — a leftover `notes.md`, a subfolder
inside `media/` — is refused on import, named so you can see which file it was.

Any zip tool works — zip the directory's contents so `manifest.json` is at the
root. If you're running the app from source, `npm run goonpack:build` zips every
pack directory under `goonpacks/` to `goonpacks/<dir>.zip`, validating each one
first with the app's own import checks — a pack that builds is a pack that
imports. Name one to build just that pack:
`npm run goonpack:build goonpacks/aimee`.

Three helper scripts do the writing for you using your configured LLM. Two
describe **pictures**: `npm run goonpack:describe-missing` (every picture with
no sidecar yet) and `npm run goonpack:describe <path-to-image>` (one picture).
Videos are left alone — write their sidecars by hand. The third,
`npm run goonpack:summarise`, writes the `mediaSummary` from the sidecars a pack
already has.

`describe-missing`, `summarise` and `build` all take a pack directory to work on
just that pack, which is the order to do them in for a new one:

    npm run goonpack:describe-missing goonpacks/luna
    npm run goonpack:summarise goonpacks/luna
    npm run goonpack:build goonpacks/luna

## Importing and versions

Goonpacks tab → **Import pack**. The pack's card is shown from its manifest
before anything is written, so you see what you're about to install; the unpack
runs once you confirm, with a progress line, and the installed row that follows
adds what the pack turned out to hold. Versions install side by side; only
re-importing the exact same id + version replaces one. Each installed version
lists on the Goonpacks tab with what it brings; Remove takes out just that
version, and conversation threads always stay.

On the Companions screen, a companion's card carries the pack pickers: the
version (newest first, and the default) and an overlay to lay on top. The card's
description, colour and feature line follow what you've picked.

Every app load re-checks every stored pack against the current rules. A pack
that fails — its base was removed, or the pack format has moved on — stays on
the Goonpacks tab marked incompatible with the reasons, and isn't offered on the
chooser; fix the cause (or re-import a corrected zip) and it comes back.

A sent picture or video stays in the conversation as a stable reference, not a
copy: it resolves against whichever pack is currently loaded, so if you switch
away from the pack it came from it shows a terse placeholder rather than someone
else's — re-select the pack and it's back.
