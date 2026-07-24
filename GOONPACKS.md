# Goonpacks

A goonpack is one companion in a zip: her pictures, voice, persona and config.
The app imports packs — it never ships, hosts, or points at them (see the
[content policy](./DEVELOPERS.md#content-policy)).

## Assembling a pack

Lay out a directory and zip its **contents** (the manifest sits at the zip
root):

    manifest.json       who she is — fields are documented at the definition:
                        src/lib/goonpacks/manifest.ts
    system-prompt.md    her persona. Optional {{PLACEHOLDER}} tokens pull in
                        the app's shared prompt sections (names and text in
                        src/lib/companions/shared-prompt.ts); omit a token and
                        that section is simply absent.
    pictures/           optional. jpg/png/webp, each with an optional
                        <name>.txt caption she reads when choosing one.

Two kinds of pack:

- **Complete** — a new companion. Needs `id`, `version`, `aboutThePack`, `name`,
  `voiceId` and `system-prompt.md`.
- **Overlay** — your version of an existing companion: add `base` with her id
  and include only what changes (pictures, voice, prompt, colour). An overlay
  can't change her name or gender — same her, same conversation memory,
  whichever pack you play her with. `noPictures: true` deliberately strips the
  base's pictures.

Every pack describes itself in `aboutThePack` — about the pack, not her
(`description` is hers).

Ids are `publisher.name` (`g00ner.aimee`) and never version — if an update
changes who she is, that's a new companion with a new id. `version` is yours,
any text; versions of a pack install side by side, sorted alphanumerically so
the newest comes first.

With pack sources under `goonpacks/<dir>/`:

- `npm run goonpack:describe-missing` — caption any pictures lacking a `.txt`
  (uses your configured LLM).
- `npm run goonpack:describe <path-to-image>` — caption one image.
- `npm run goonpack:build` — validate and zip every pack directory to
  `goonpacks/<dir>.zip`. A pack that builds is a pack that imports: the build
  runs the app's own import checks and fails with the same messages.

Any zip tool works too.

## Importing

Goonpacks tab → **Import pack**. The pack's info is shown before anything is
stored. Versions install side by side — only re-importing the exact same id +
version replaces one. Each installed version lists on the Goonpacks tab with
what it brings; Remove takes out just that version, and threads always stay.

On the Companions screen, a companion's card carries the pack pickers: her
version (newest first, and the default) and an overlay to lay on top. The card's
description, colour and feature line follow what you've picked.

Every app load re-checks every stored pack against the current rules. A pack
that fails — its base was removed, or the pack format has moved on — stays on
the Goonpacks tab marked incompatible with the reasons, and simply isn't offered
on the chooser; fix the cause (or re-import a corrected zip) and it comes back.

A sent picture stays in the conversation as a stable reference, not a copy: it
resolves against whichever pack is currently loaded, so if you switch away from
the pack it came from it shows a terse placeholder rather than someone else's
picture — re-select the pack and it's back.

Packs live in browser storage; keep your zips. If the browser clears its storage
the app just forgets the pack — importing the zip brings it back.

A pack's `voiceId` must exist in the ElevenLabs account the app runs with;
voices don't travel between accounts yet.
