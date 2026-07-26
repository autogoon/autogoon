# Goonpack media storage — design

**2026-07-26.** Import unzips a pack into an OPFS directory tree, verifies the
tree, and discards the zip. Media bytes are never held in memory: the library is
rebuilt at each app load from every tree's manifest and captions, and a media
file is read off disk only when it is displayed. Video is stored, validated and
played alongside stills.

## Why now

The app is to be hosted at `autogoon.vercel.app`, where users bring their own
packs and nothing is served from the origin. Everything therefore lives in the
user's browser — which the current storage model cannot survive at the sizes
packs already reach, let alone with video.

**What packs weigh.** The example pack
([`goonpacks/elise/`](../../../goonpacks/elise/)) is 5 KB. A real pack of stills
could run to hundreds of MB, and packs with video could easily enter multiple-GB
territory.

**What the code assumes.** [`pack.ts`](../../../src/lib/goonpacks/pack.ts) opens
with "packs are a few MB" — off by orders of magnitude before video. The
consequences compound:

- [`store.ts`](../../../src/lib/goonpacks/store.ts) stores each pack as one
  `ArrayBuffer`. An `ArrayBuffer` is memory, in full, always.
- `refresh()` in
  [`use-goonpack-library.ts`](../../../src/hooks/use-goonpack-library.ts) calls
  `getAll()` — every byte of every pack resident at once — then `unzipSync`s
  each one **on the main thread**, on **every app load**, purely to re-derive a
  manifest and a picture count.
- `loadContent()` inflates the whole zip _again_ to play a pack, and eagerly
  mints an object URL per picture.
- `importPack()` calls `file.arrayBuffer()`, materialising a multi-GB zip whole.

**This is drift, not design.** The original spec
([2026-07-23](./2026-07-23-goonpacks-design.md), "Loading and storage") called
for a record holding "the parsed manifest plus the original zip blob", with
"startup reads manifests only (cards render without unzipping)". Neither
happened. The "no stored derived state" rationale in `store.ts` was written
around the drift rather than driving it; stored derived state, with healing, was
the plan from the start.

**Video is not merely bigger, it is differently shaped.** A `<video>` element
needs a seekable source. A zip entry cannot be range-read when deflated — and
packs will usually be deflated, since most are zipped with Finder or 7-Zip
rather than [`goonpack-build.ts`](../../../scripts/goonpack-build.ts). Playing a
video out of a stored zip means inflating the entire video into memory first.
Extracted to OPFS, a video is a `File` the browser streams and seeks natively.

## What OPFS buys, precisely

OPFS shares the same origin quota and the same eviction rules as IndexedDB — it
is a different API onto the same pool, not a larger one. It is not chosen for
capacity. It is chosen because extraction happens **once**:

- Each entry is inflated exactly once, ever, rather than on every access.
- Media becomes `File` objects the browser's own image and video decode paths
  consume directly.
- Validation stops touching media at all (below).

Storing the zip as a `Blob` rather than an `ArrayBuffer` would fix the memory
problem alone — a `Blob` in IndexedDB is disk-backed and lazily read. It would
not fix repeated inflation or give video a seekable source.

## Pack format

**`pictures/` becomes `media/`**, holding stills and videos together. Captions
keep the existing sidecar convention — `video.mp4` → `video.txt` — described in
[GOONPACKS.md](../../../GOONPACKS.md).

- **Stills:** `.jpg`, `.jpeg`, `.png`, `.webp`, as now.
- **Videos:** `.mp4` and `.webm`. **`.mov` is rejected** with a message saying
  so — it plays in Safari and unreliably elsewhere, so accepting it yields packs
  that work on their author's machine and not on a stranger's.
- **`noPictures` becomes `noMedia`**, with the same meaning.
- **`{{PICTURES_SECTION}}` becomes `{{MEDIA_SECTION}}`**, its text covering
  videos as well as stills.
- **`format` becomes `2`.** Not for compatibility — see below — but so a pack
  written to the old layout fails with "this pack uses the old `pictures/`
  layout" instead of the misleading "no media found".

**A format 1 pack is still accepted when it used neither of those two things.**
The formats differ in exactly the media folder's name and `noPictures`; a pack
with no `pictures/` folder and no `noPictures` field — the pictureless example
pack, any voice-only or colour-only overlay — already _is_ a format 2 pack, and
telling its author to rebuild it would be telling them to change nothing. This
is not the compatibility the next paragraph rules out: nothing old is read in an
old way. It costs the format gate its manifest-only purity, since whether a
`pictures/` folder exists is a fact about the tree, so that half of the check
lives in `parsePack` and the `noPictures` half stays in `parseManifest`.

**No backwards compatibility.** Installed packs are not carried over, and
existing threads' picture references are not preserved. Both were considered and
deliberately dropped: packs are re-imported from the user's zips (which have
always been the store of record), and unresolvable thread refs already degrade
to a placeholder by design (`resolvePictureRef`,
[`resolve.ts`](../../../src/lib/goonpacks/resolve.ts)). IndexedDB leaves the
pack path entirely; all that remains of it is a one-off
`deleteDatabase('autogoon-goonpacks')` at app load, purely to reclaim the quota
on browsers still holding the old zips. It can be dropped from a later version.

## Storage model

**OPFS holds one directory tree per installed pack**, keyed by the existing
`id@version` storage key (`packKey`,
[`entries.ts`](../../../src/lib/goonpacks/entries.ts)), containing the pack's
files as extracted.

**Nothing is persisted outside the trees.** There is no stored index — not in
IndexedDB, not in localStorage. The library is built in memory at app load by
walking the trees: per pack, read `manifest.json`, check whether
`system-prompt.md` exists, list `media/`, and read the captions. It lives in a
variable for the session.

**The captions belong in it.** The media picker needs every caption each time
the companion chooses something to send — reading them off disk at that moment
would be hundreds of file reads per pick, instead of once at load.

That also keeps the property `store.ts` currently claims but can't afford:
validity is one live verdict. `parseManifest` and the cross-pack rules in
`refresh()` run over what is on disk, every load, so an incompatible pack still
heals when its base is re-imported. And with nothing derived persisted anywhere,
there is no second store to drift out of step with the trees.

**A marker file, written last, means the tree is complete.** Extraction and
validation both succeed before it appears. Without it an interrupted import
would be undetectable: validation goes on names, so it cannot tell a complete
`media/` from one missing six hundred files, and a half-extracted pack would
pass every check and simply be short. Its existence is the whole signal —
nothing needs to be in it, and extra files at the tree root are already ignored
by validation.

## Reading a pack

**Reading is over the OPFS tree** — list entries, read one entry. `parsePack`
stops taking a bag of inflated bytes and becomes a validation pass over that.

**Validation never reads media.** Every rule in `parsePack` — permitted
extensions, no subfolders, no stem collisions, caption pairing, the
complete-vs-overlay completeness rules — is a rule about _names_. Only
`manifest.json`, `system-prompt.md` and the captions are read. Validating a
multi-GB pack costs a few hundred KB.

This is what makes `ParsedPicture.bytes` disappear. Today every picture's bytes
are held in memory so that `summarize()` can count them.

## Import

Extraction runs **in a Worker** — seconds rather than minutes, since nothing
crosses a network, but far too much to block the main thread. The worker reports
progress. There is no cancel: the wait is short, and the load-time clean pass
removes an abandoned tree anyway.

1. **Check quota first.** `navigator.storage.estimate()` against the zip's size
   plus headroom, refusing up front with a real number rather than failing
   partway through. Request persistence (`navigator.storage.persist()`) on first
   import.
2. **Extract to OPFS**, stripping junk on the way in: `__MACOSX/`, `.DS_Store`,
   resource forks.
3. **Validate the extracted tree.** A tree that fails deletes itself and the
   import reports why.
4. **Write the marker file.**

**The zip is transport and is not kept.** Its structural faults matter only
insofar as they produce a bad tree — with one exception worth detecting
explicitly: when everything lands under a single top-level folder, say so
("everything is inside `yourpack/` — zip the folder's contents, not the folder")
and **still fail**. Naming the mistake is a courtesy; tolerating it is not.

## Load

Startup walks the pack trees, reads each manifest and its captions, applies the
cross-pack rules, and builds the entries the chooser renders. That in-memory
index is what every panel reads for the rest of the session.

## Play and rendering

`resolveVariant` no longer inflates anything. Each media entry in the index
carries its caption, its kind and its object URL, and the URL is filled **on
first render** — `getFileHandle` → `getFile` → `createObjectURL` — rather than
at load, where it would be thousands of async calls for URLs most of which are
never shown.

A URL then lives as long as its index entry, so it is revoked only when the pack
is removed or re-imported. `resolveVariant`'s created/winning/losers bookkeeping
goes with it: a base and an overlay each have their own entries, so choosing a
variant is picking which list to read rather than building one set and
discarding another. The stable thread reference `goonpack:<key>/<name>`
(`use-goonpack-library.ts`) is what a rendered picture or video resolves
through, as now.

**Videos are chosen and sent exactly as stills are** — the same caption-driven
selection over the same pool, with a video rendering as a `<video>` rather than
an `<img>`. Playback needs no special handling: the concern in
[roadmap/KEYWORD-DETECTION.md](../../../roadmap/KEYWORD-DETECTION.md) is media
playing on a _different_ device, not the app's own output. Video captions are
hand-written for now.

## Reconciliation

Browser-initiated eviction is bucket-granular: an origin's OPFS, IndexedDB and
Cache Storage go together, so a pack is never half-evicted. What does leave a
tree in a bad state is **interruption** — a crash mid-extract, a crash
mid-removal, `QuotaExceededError` partway through.

One clean pass at app load covers all of it: **a tree with no marker file is
deleted.** For that to catch a crashed removal too, removing a pack deletes its
marker first and the tree second — so an interrupted removal leaves a markerless
tree, which is exactly what an interrupted import leaves. Same state, same
treatment, no migrations and no special cases.

## Files touched

- [`src/lib/goonpacks/store.ts`](../../../src/lib/goonpacks/store.ts) —
  replaced: OPFS trees, the marker file, and the one-off purge of the old
  database.
- [`src/lib/goonpacks/pack.ts`](../../../src/lib/goonpacks/pack.ts) — validation
  over a tree; `ParsedPicture.bytes` goes.
- [`src/lib/goonpacks/entries.ts`](../../../src/lib/goonpacks/entries.ts) —
  `PackSummary` and `VariantSlot` learn media rather than pictures.
- [`src/lib/goonpacks/resolve.ts`](../../../src/lib/goonpacks/resolve.ts) —
  `noMedia`; references and kinds in place of eager `src`.
- [`src/lib/companions/shared-prompt.ts`](../../../src/lib/companions/shared-prompt.ts)
  — `{{MEDIA_SECTION}}`, its text covering videos.
- [`src/hooks/use-goonpack-library.ts`](../../../src/hooks/use-goonpack-library.ts)
  — the in-memory index built at load, lazy URLs, the clean pass.
- [`src/components/goonpacks-panel.tsx`](../../../src/components/goonpacks-panel.tsx)
  — import progress; media counts.
- [`src/components/play-modes/companions-panel/index.tsx`](../../../src/components/play-modes/companions-panel/index.tsx)
  — `<video>` for video references in the thread.
- [`GOONPACKS.md`](../../../GOONPACKS.md) — `media/`, videos, `noMedia`,
  `format: 2`.
- `.gitignore` — `/goonpacks/elise/pictures/` becomes `media/`.
- [`scripts/goonpack-build.ts`](../../../scripts/goonpack-build.ts) — zips
  `media/`, validates against the new rules.
- [`scripts/describe-missing.mjs`](../../../scripts/describe-missing.mjs) and
  [`scripts/describe-image.mjs`](../../../scripts/describe-image.mjs) — walk
  `media/`, and skip videos rather than mis-handle them (video captions are
  hand-written for now).
- [`goonpacks/elise/`](../../../goonpacks/elise/) and the local packs — rebuilt
  to the new layout.
