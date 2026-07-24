# Goonpacks

A goonpack is one companion in a zip: her pictures, voice, persona and config.
The app imports packs — it never ships, hosts, or points at them (see the
content policy in DEVELOPERS.md).

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

- **Complete** — a new companion. Needs `id`, `version`, `name`, `voiceId` and
  `system-prompt.md`.
- **Overlay** — your version of an existing companion: add `base` with her id
  and include only what changes (pictures, voice, prompt). She keeps her
  conversation memory whichever variant you play.

Ids are `publisher.name` (`g00ner.aimee`) and never version — if an update
changes who she is, that's a new companion with a new id. `version` is yours;
the app displays it and nothing else.

With pack sources under `goonpacks/<dir>/`:

- `npm run goonpack:describe-missing` — caption any pictures lacking a `.txt`
  (uses your configured LLM).
- `npm run goonpack:describe <path-to-image>` — caption one image.
- `npm run goonpack:build` — zip every pack directory to `goonpacks/<id>.zip`.

Any zip tool works too.

## Importing

Companions screen → **Import pack**. The pack's info is shown before anything is
stored; importing an id you already have replaces it (threads stay). Removing a
companion pack also removes her overlays — threads still stay.

A sent picture stays in the conversation as a stable reference, not a copy: it
resolves against whichever pack is currently loaded, so if you switch away from
the pack it came from it shows a terse placeholder rather than someone else's
picture — re-select the pack and it's back.

Packs live in browser storage; keep your zips. If the browser evicts one, the
card asks for the file again — nothing else is lost.

A pack's `voiceId` must exist in the ElevenLabs account the app runs with;
voices don't travel between accounts yet.
