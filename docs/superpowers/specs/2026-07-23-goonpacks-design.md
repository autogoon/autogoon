# Goonpacks — design

Date: 2026-07-23. Follows the settled decisions recorded in
[TODO.md#goonpacks](../../../TODO.md#goonpacks); supersedes the deleted
`roadmap/GOONPACKS.md`. Distribution constraints per the
[content policy](../../../DEVELOPERS.md#content-policy): import-your-own-file is
the only path in; the project never hosts, indexes, or points at packs.

## Goal

A companion persona as a portable, self-contained `.zip` the app imports at
runtime. The app is a player for persona content; a pack is how one persona
travels. The core work is build-time-baked personas → runtime-loaded packs.

## Pack format

```
manifest.json         identity + config (fields below)
system-prompt.md      persona text; optional {{PLACEHOLDER}} tokens
pictures/             optional
  <name>.jpg|png|webp
  <name>.txt          description sidecar (same convention as describe-image)
```

`manifest.json` fields:

- `format` — pack-format version, `1`. A newer format number than the app knows
  is a terse import error ("made for a newer version").
- `id` — `publisher.name`, validating as `^[a-z0-9-]+\.[a-z0-9-]+$` (both halves
  strict slugs, single dot). Unversioned: the id means _the same her_ — a
  compatible update keeps the id (and her thread); an incompatible one is a new
  companion. The namespace is a convention, not verification.
- `base` — present only on an overlay: the id of the companion it modifies
  (stock or imported alike).
- `version` — required, informational only: the author's own version, ideally
  semver (`1.0.0`) but accepted as any string and displayed as-is (library, and
  both sides of a same-id replacement confirm). Never interpreted — no ordering
  or compatibility logic hangs off it; `format` and the unversioned-id rule own
  those.
- `name`, `description`, `gender`, `accentColour` — card/display fields,
  matching the `Companion` fields in `src/lib/companions/companions.ts`.
- `voiceId` — ElevenLabs voice id (not a secret, but **private to its ElevenLabs
  account**: the id only resolves where the app's account can use it, so a
  pack's voice doesn't truly travel yet — v1 accepts this; voice creation from a
  prompt is the successor, see Out of scope).
- `model`, `contextWindow`, `passesReasoning` — optional; default to the app's
  current defaults when omitted.

For a **complete pack**, `id`, `version`, `name`, `voiceId` and
`system-prompt.md` are required; pictures optional. For an **overlay** (`base`
present), everything except `id`, `base` and `version` is optional — a present
field replaces the base's; a pictures directory, when present, is the variant's
picture set.

### System prompt placeholders

Persona text may embed `{{PLACEHOLDER}}` tokens naming the shared prompt
sections exported by `src/lib/companions/shared-prompt.ts` (e.g.
`{{OUTPUT_FORMAT_SECTION}}`). The loader substitutes them with the app's current
section text at load time, so the mechanical rules stay app-owned and packs
benefit when they improve. Sections are **optional**: a prompt that omits a
placeholder simply doesn't get that section. Unknown tokens are left in the
prompt exactly as written, so a misspelled one is visible rather than silently
becoming nothing. The existing live markers (`{{TOY_STATUS}}`, `{{NOW}}`) use
the same syntax and pass through the same way, for the runtime fill that already
exists.

`TIME_SECTION` is the one exception to "optional", and has no token: every
companion is sent a TIME line, so the loader appends the rules for reading it to
every prompt it assembles. A pack that never heard of it, or one with no device
that leaves out `{{CONTROL_SECTION}}` (where the rule used to live), still gets
them.

## Library model

- **Import many, no merging.** The library holds as many packs as browser
  storage allows. Packs never combine inside the app; remixing is combining zips
  by hand outside it.
- **One card per companion.** The chooser shows the built-ins plus each imported
  complete pack. Overlays never add cards.
- **Variants inside the card.** A companion's card lists her variants —
  _default_ plus each imported overlay targeting her — and the user picks one
  each time; default is always available, so a bad overlay never bricks her.
  Nothing is persisted as an "active" selection; the last-played variant may be
  recorded purely to indicate it in the list (cosmetic, localStorage).
- **A complete pack can be overlaid too** — `base` may name any companion id.
  The card/variant UI is uniform across stock and imported companions.

## Identity and lifecycle

- **Same-id import is a deliberate full replacement**, user-confirmed, with the
  manifest info shown in the confirm sheet (the zip is right there to display).
- **Overlay import requires its base installed** — otherwise a terse error. User
  actions never create an orphaned overlay; eviction can (see Loading and
  storage), and that state is shown as awaiting re-import, never auto-deleted.
- **Removing a companion pack cascade-removes its overlays**, stated in the
  removal confirm. Nothing durable is lost: the zips on the user's disk are the
  source of truth. The cascade applies to user-initiated removal only — eviction
  never deletes what survived it.
- **Removal never touches threads.** Re-importing the same id brings her back
  with memory intact.

## Threads

The thread is keyed by companion id (`companions:thread:<id>`,
`src/hooks/use-voice-session.ts`) and **always belongs to the base**: whichever
variant is played, an overlay session reads and writes its base's thread. An
overlay is "my version of her" — deep or shallow, she's the same her, one
continuous memory. A complete pack's thread keys by its own id. Deleting a
thread stays what it is today: an explicit in-session action.

**Pictures in threads are stable references, resolved at render.** A pack
picture's `src` is a session-scoped object URL, so a sent picture persists in
the thread as `goonpack:<packId>/<name>`, never as a raw URL. Rendering resolves
the reference against the currently-loaded variant's pictures — an exact pack +
name match shows the live image; anything else shows a terse placeholder, never
a substitute picture (a same-named picture in a different pack is still a miss).
The thread is never rewritten for this: select the old pack again and its
pictures resolve again. Pre-goonpacks threads stored raw paths as `imageSrc`;
those never resolve either (the files are gone) — placeholder, not a pretend
URL.

## Loading and storage

- **Import:** file picker → unzip in the browser (via `fflate`; new, small npm
  dependency) → validate manifest, id, prompt, images → confirm sheet → store.
- **IndexedDB is a cache, not a store of record.** One object store, keyed by
  pack id, each record holding the parsed manifest plus the original zip blob.
  The zip file on the user's disk is the source of truth; losing browser storage
  costs a re-import, never data. The library UI carries one terse line making
  this explicit (e.g. "Packs live in browser storage; keep your zips.").
- **Startup reads manifests only** (cards render without unzipping); a pack is
  unzipped when played, its images becoming in-memory object URLs — a picture's
  `src` is already just a string handed to `<img>`, so nothing downstream
  changes.
- **Eviction can be partial — never assume all-or-nothing.** Browsers may evict
  individual records, the whole database, or localStorage independently. A
  lightweight localStorage **library index** (pack id, name, `base` if overlay)
  exists solely so startup can tell _evicted_ from _never imported_: a known id
  with no IndexedDB record renders as a re-import placeholder (card or variant)
  instead of silently vanishing; an unreadable stored blob counts as evicted; a
  record with no index entry heals the index (it's derived state, rebuilt from
  whatever survives). An evicted base leaves its overlays listed under the
  placeholder, waiting for the base's re-import. Beyond this index and the
  cosmetic last-played marker, nothing pack-related lives in localStorage.
- **Built-ins never touch storage — and ship pictureless.** They stay pure code;
  pictures reach a built-in only via an overlay pack, the same path as anyone
  else's. The build-time picture pipeline retires (see Stock-id migration).

## Stock-id migration

Stock companions move to `autogoon.elise` / `autogoon.aimee` / `autogoon.miley`:

- `CompanionId` loosens to `string`; the `COMPANIONS` record moves to the new
  ids. The `pictures` field stays a runtime `Companion` field, but no built-in
  populates it.
- **The build-time picture pipeline retires**: `gen:pictures`
  (`scripts/generate-companion-pictures.mjs`), the generated
  `companion-pictures.generated.ts`, the pre-hooks that run it, and
  `public/companions/` all go. The developer's own pictures migrate to local
  overlay-pack sources under gitignored `goonpacks/<name>/` (already created:
  `g00ner.aimee`, `g00ner.miley` overlaying the built-ins with the existing
  picture sets) — zip a pack directory's contents (manifest at the archive root)
  and import it like any other pack.
- **No thread migration.** Threads saved under the old bare ids are simply
  orphaned by the rename — accepted cost (decided mid-build; the one real
  install had already been migrated by hand, and old threads' pictures wouldn't
  survive anyway).

## Authoring tooling

Pack authoring tooling lives in the main repo (no template pack — the format
above and DEVELOPERS.md describe the layout; a manifest is four lines) and
operates on the gitignored `goonpacks/` sources, npm-namespaced `goonpack:*`:

- **`goonpack:build`** — zips each `goonpacks/<dir>/`'s contents into
  `goonpacks/<id>.zip`, the id read from its manifest (so directory names stay
  free). Uses `fflate` — the same dependency the client-side unzip brings in —
  so no system `zip` binary is involved.
- **`goonpack:describe-missing`** — today's `describe:missing` repointed from
  `public/companions/` to `goonpacks/*/pictures/`: writes a `.txt` sidecar for
  every image lacking one.
- **`goonpack:describe`** — today's single-image `describe`, renamed into the
  namespace (it already takes an explicit path).

The authoring loop: drop images into `goonpacks/<dir>/pictures/`, run
`goonpack:describe-missing`, then `goonpack:build`, then import the zip in the
app.

## Documentation

Ships with the implementation, not after it:

- **`GOONPACKS.md`** (top level, user-facing, alongside `MODES.md`) — how to
  assemble a pack: the directory layout, writing or generating description
  sidecars, complete pack vs overlay, ids and versions, zipping
  (`goonpack:build` or any zip tool), importing, and the storage caveat ("keep
  your zips"). Points at the manifest definition in code for the field list
  (code owns the what); links the content policy for what may move around.
- **`modes/COMPANIONS.md`** — gains the user-facing library behaviour: import,
  the card/variant picking, removal, re-import placeholders.
- **`DEVELOPERS.md`** — repo mechanics: the gitignored `goonpacks/` sources
  directory, the `goonpack:*` scripts, the picture pipeline's retirement
  (existing `gen:pictures` / `public/companions/` mentions updated), and the
  adding-a-companion checklist revised for pictureless built-ins.
- `modes/GOON.md`'s picture-pipeline mention updated to match.
- The usual `/doc-check` pass before PR and again before merge.

## UI

On the companions chooser: an **Import pack** affordance; imported complete
packs as cards alongside the built-ins; each card's variant list (default +
overlays, publisher shown; last-played indicated); a remove affordance on
imported packs and overlays; re-import placeholders for evicted packs;
display-name collisions disambiguated by publisher. Import/validation failures
are terse errors. Copy stays terse throughout.

## Errors and validation

Reject with a short message, storing nothing partial: unreadable zip, missing or
malformed manifest, bad id slug, unknown newer `format`, overlay without an
installed base, complete pack missing required fields, unsupported image types.
No hard size cap — guidance stays "a curated persona, ~50 images, a few hundred
absolute max".

## Testing

- **Jest** over the pure parts: manifest validation and slug rules, placeholder
  substitution (shared sections substituted, live markers untouched, unknown
  tokens dropped), overlay resolution (field replacement, picture sets,
  base-thread keying), thread picture-ref resolution, and index/store
  reconciliation (every subset of surviving records resolves to the right mix of
  live cards, placeholders, and healed index).
- **Playwright**: a committed fixture zip imported through the real file input;
  assert the card appears, a variant lists, and removal works — on all three
  engines. No voice needed.
- The usual gates: typecheck, lint, build.

## Out of scope

In-app pack export/authoring — building or exporting a pack from inside the
app's UI; authoring happens outside the app, with the repo-side `goonpack:*`
scripts (see Authoring tooling) or any zip tool. Also out: pack
signing/verification, bring-your-own API keys (orthogonal: an imported pack runs
on whatever keys the build has), the inference library (goonpacks' v2 — see
`roadmap/INFERENCE-LIBRARY.md`).

Also deferred, noted for the record: **voice creation from a prompt.** Because a
`voiceId` is private to its ElevenLabs account, a pack's voice doesn't genuinely
travel. The second phase replaces the id with a voice prompt: the app submits it
to ElevenLabs voice design, gets three candidate voices back, and the user picks
one or iterates — a small in-app recreation of that ElevenLabs UI. v1 ships
`voiceId` and accepts the limitation.
