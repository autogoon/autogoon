# Media search — design

**2026-07-27.** A companion stops picking media by number from a list in the
tool schema. Every item carries two texts — a long description and a caption
condensed from it — a pack with media also carries a summary of that set, and
two tools replace one: `search_media` returns a bounded set of matching refs and
captions, `send_media` sends one by ref. This is the plumbing only. What a good
description contains, and how the search ranks, are settled afterwards against a
yardstick and live in
[roadmap/INFERENCE-LIBRARY.md](../../../roadmap/INFERENCE-LIBRARY.md).

## Why now

Every item's caption goes into the `send_media` tool description
([`describeMediaList`](../../../src/lib/companions/send-media.ts)) and the
companion picks a 1-based index (`pickMedia` in the same file). That works at
fifty items and fails well before a thousand — not because the context window
fills, but because a model choosing between hundreds of near-identical captions
chooses badly.

The plumbing is the part to build first.

**The inference work can't be measured until something consumes its output.**
Rewriting the caption schema so a second person, a man, and what is happening
between people have somewhere to go is worth nothing while the only consumer is
a numbered list. A better caption has to be a better _search result_ to be
better at all.

**Storing the long description makes caption iteration nearly free.**
[`describe-image.ts`](../../../scripts/describe-image.ts) already has the model
observe at length and then condense to one line, and keeps only the line. With
the observations on disk, a new caption is a re-condense of text already there —
no vision model, no image, no downscale. Without them, every caption experiment
re-runs inference over the whole set.

**The format is cheap to change while we are the only pack author.** Nothing in
circulation constrains it, and changing it is a rebuild rather than a migration.
That stops being true the moment someone else has authored a pack.

## Scope

In scope: what a pack may contain, what it stores per item and about the set,
the two tools, and the validation that keeps all of it honest.

Out of scope, and moving wholesale to
[roadmap/INFERENCE-LIBRARY.md](../../../roadmap/INFERENCE-LIBRARY.md): the
yardstick, what belongs in a long description versus a caption, model and
resolution selection, how the summary is generated and whether it is neutral or
persona-aware, and which retrieval method the search uses. The first search
implementation exists to make the tools work end to end, not to be good.

## The order of work

The steps are separable, and each is landable except where noted.

### 0. One validator, one tree, one format

Independent of the steps that follow, and first because everything after it adds
rules to the same validator. Three changes, in order.

**`parsePack` judges every path.** It walks the tree's names and skips anything
outside `media/`, so a pack may carry files it never declared and nothing says
so. That skip is why a `pictures/` folder needed a bespoke check outside the
validator, and why a rule that already exists — `media/` can't contain
subfolders — never fires on a pack built from a source directory. Replace the
skip: the manifest, the prompt and `media/*` are recognised, and every other
path is named as one that doesn't belong.

One thing has to move with it. `store.ts` writes a completion marker inside the
pack directory and `listTree` returns it like any other file, so the new rule
would refuse every installed pack at load. Filtering it back out on the way to
the validator leaves the store's bookkeeping sitting in the pack's own
directory, where a zip entry of that name can forge it and where the tree an
import validates is one file different from the zip it came from. The marker
moves out instead: `<key>.complete` beside `<key>/`, so a pack's directory holds
the pack and nothing else. Extraction then needs no special case for the name,
and the fs walk and the extracted tree hand the validator the same set of names.

**The build validates the tree it ships.** `goonpack-build.ts` hand-picks the
manifest, the prompt and the contents of `media/`, builds a `PackTree` from that
list, and validates it — so the tree it judges is not the tree an author has.
Walk the source instead, validate what was walked, and zip what was validated.
The `pictures/` check then deletes itself, and a live defect goes with it: the
collection loop reads media with a call that throws on a directory, inside a
`catch` that reads the throw as "no media dir", so a subfolder in `media/` drops
every file sorting after it and the build still reports success.

**One format, numbered 1.** The two formats differ only over the media folder's
name and the field that strips a base's media, and no pack in circulation uses
the old spelling of either. Deleting that path leaves `parseManifest` accepting
exactly one value — `OLD_LAYOUT_PROBLEM` goes, with the `pictures/` and
`noPictures` branches in [`manifest.ts`](../../../src/lib/goonpacks/manifest.ts)
and [`pack.ts`](../../../src/lib/goonpacks/pack.ts). The tree half is already
redundant by then, since an unrecognised folder is refused whatever the manifest
declares.

The simplification is deleting the branch; the renumbering is so the first
format any other author ever sees is `1`. Both the pack sources under
`goonpacks/` and the `format` field documented under "Every pack needs" in
[GOONPACKS.md](../../../GOONPACKS.md) say `1` afterwards, and that document
gains the rule the validator now enforces: what a pack may contain.

### 1. Two texts per item

Store the long description beside the caption. `describe-image.mjs` writes both;
[`parsePack`](../../../src/lib/goonpacks/pack.ts) reads both;
`ParsedMedia`/`CompanionMedia` carry both.
[`describe-missing.ts`](../../../scripts/describe-missing.ts) shares
`sidecarPath` with the describing script, so it follows the rename.

The long description is stored **opaquely** — a text blob, whatever the
describing script emits. Nothing in the format may assume anything about its
internal structure, because restructuring it is exactly what the roadmap work
does. A format encoding today's schema would have to change when the schema
does.

### 2. The set summary in the manifest

A pack with media carries a summary of that set in `manifest.json`, opaque like
the description and for the same reason: what it should say is the roadmap's
question. An npm script generates it from the captions and descriptions of the
pack's own media, so regenerating after a change is one command.

The summary is what replaces the numbered list in the prompt. What it has to
carry to do that is **The set summary** in
[roadmap/INFERENCE-LIBRARY.md](../../../roadmap/INFERENCE-LIBRARY.md).

### 3. Building and importing

[`goonpack-build.ts`](../../../scripts/goonpack-build.ts) runs `parsePack`
before zipping, so a validation rule added there covers both building a pack and
importing one. Two rules:

- A media file missing either text is a build and import failure, not a silent
  empty string as today.
- A pack with media and no summary is a build and import failure. A pack with no
  media needs no summary.

### 4 and 5. The two tools — one change

`search_media` takes a description and returns a bounded set of matches, each a
ref and its caption. `send_media` takes a ref.

These land together. `search_media` returning refs is inert while `send_media`
still takes an index, and the moment `send_media` takes a ref the numbered list
must leave the prompt. Two commits, one landable change.

The ref already exists: `goonpack:<key>/<stem>`, built in
[`library.ts`](../../../src/lib/goonpacks/library.ts) and persisted on a thread
turn as `mediaRef`. Reusing it settles a defect the index has today — a
historical `send_media` call in a thread denotes a different picture once a pack
version or overlay changes the set.

`MEDIA_SECTION` in
[`shared-prompt.ts`](../../../src/lib/companions/shared-prompt.ts) stops
describing a list in the tool schema and starts carrying the summary.

### 6. Result diversity

The levers are deferred; the return shape they need is not. See **What the tool
change must not foreclose**.

## Why two tools

One tool taking a description searches on **every send**. Two tools search once
per **topic**: one `search_media` yields a working set of refs, and the sends
that follow are lookups against it with no inference at all. Sessions sit on a
topic, so the extra call is paid once and the two-call shape is cheaper in
practice.

It also changes what the companion knows when they send. Today they pick blind
and the tool result tells them what went, which is why the prompt rule exists —
they are told it sent, and _then_ they say something about it. With a working
set in hand they have already read the caption of what they chose. Whether that
rule can relax is worth testing, not assuming.

The corpus still never enters their context. A bounded working set does, as
append-only tool results, so the prefix cache is unaffected.

**`search_media` cannot send.** A variant that sends its top hit and returns the
rest would save a turn on a one-off request, and the case for it is a companion
whose set is a miscellany rather than a themed shoot, asked for something at
random. Noted, not built — and the sampling lever in **What the tool change must
not foreclose** may serve that case without a second tool.

## The sidecar format

`beach.jpg` alongside `beach.md`: caption in YAML frontmatter, long description
as the Markdown body. The `.txt` sidecar is replaced, not accepted alongside.

**Markdown rather than JSON**, because the long description is the thing the
roadmap work will restructure — scene, then each person, then any text in the
image — and a body that carries paragraphs and headings fits that, and goes into
a reranking prompt with no unescaping step. A JSON string field would encode the
structure as escape sequences.

**Frontmatter rather than a second `.txt`**, because the roadmap's later
per-item fields — an attribute panel, a near-duplicate cluster id, text found in
the image — land in frontmatter rather than in another file per item each time.
Embeddings never go in a text file.

**A library, not a hand-rolled parser.** This parser runs client-side in the
Next bundle, which rules out the Node-oriented options; `yaml` with the fences
split by hand, or `front-matter`, are the candidates. Compare what each costs
the bundle before choosing.

**Unknown keys are rejected**, matching how
[`manifest.ts`](../../../src/lib/goonpacks/manifest.ts) validates today — a
known-field set and a problem message naming the offending key. A mistyped
`capton:` fails at import instead of silently losing the caption. The cost is
that each roadmap field added later is a format change, which is accepted here:
the roadmap cannot yet say what the attribute panel's fields are, so reserving
names now would be guessing at names that would change.

Adding a key is a rewrite of sidecars from text already on disk, not a new
inference pass — only a change to what the model must _extract_ costs inference,
and that is a schema change rather than a format one. So the trade stays cheap
until another author's packs exist.

## Pack format version

Phase 0 (**The order of work**) leaves one accepted format value, numbered 1.
Everything after it extends that format rather than bumping it: there are no
packs by any other author, so nothing in circulation constrains the choice, and
the additions here are all new fields rather than changes to how existing ones
are read.

One consequence beyond import: a pack is re-parsed from its OPFS tree at every
app load, so a pack already installed in a browser goes invalid on the next load
and must be re-imported.

## What the tool change must not foreclose

A search returning the top N over a set holding hundreds of similar items
returns the same N every time. The levers, none of them chosen here:

- **Excluding what has already been sent.** Stops repeated sends; a repeated
  search still returns the same candidates.
- **Near-duplicate collapse**, so N hits are N distinct shots rather than one
  burst and its neighbours.
- **A cursor**, so a second search continues past the first. Makes the search
  stateful per topic.
- **Sampling from everything above a threshold** rather than strict top-N, so
  two identical searches differ. This is also what "something at random" wants,
  so it may serve the query-less case and remove the argument for a sending
  variant of `search_media`.

What `search_media` does decide, and must decide deliberately, is its **return
shape**: whether a result carries a cursor, whether its order is deterministic,
and whether it is a page or a set. Choose a shape that admits any of them, then
pick a lever against a real library.

N itself is a number to tune against a real set, not a constant to fix here.

## Both texts are authored data

The pack is the output of an offline pipeline. The app never re-derives either
text — it reads what the pack ships — so "nothing derived is persisted" does not
apply. The caption being condensed from the description is a fact about how the
pipeline produces a pack, not about app state.

## Testing

- `parsePack` names a path that has no place in a pack, and still names a
  wrapper folder as a wrapper folder rather than complaining about every path
  inside it.
- The marker lands beside the pack directory, not in it, and a re-import clears
  the previous one before it starts writing — otherwise a re-import that dies
  part-way is read as complete.
- Phase 0 also deletes behaviour, so the tests covering the old layout go with
  it rather than being retargeted. What remains of the format contract is that a
  value above the one the app reads asks for a newer app, and anything else is
  refused as unrecognised.
- `parsePack` rejects media missing either text, and a pack with media and no
  summary, each with its own message.
- Frontmatter parsing: an unknown key is a problem naming the key; a caption
  survives a body containing `---`.
- Ref round-trip: a ref returned by `search_media` resolves through `send_media`
  to the same item, and a ref for an item not in the pack is refused rather than
  clamped.
- The search itself is exercised through the tools, over a fixture pack. Its
  ranking quality is not asserted — that is the roadmap's yardstick, and a test
  that pins today's ranking would fail on every improvement to it.

## Open questions

- **When strict frontmatter stops being affordable.** Rejecting unknown keys
  means a format change per roadmap field. That is cheap while packs are ours
  and rebuilding is a script, and stops being cheap once another author's packs
  exist. Revisit then.
- **Which frontmatter library**, decided on bundle cost.
- **Whether the prompt's "told it sent, and then speak" rule can relax** now
  that a companion reads a caption before choosing.
- **Which diversity lever**, and the value of N, both against a real set.
- **Whether `search_media` ever sends**, which sampling may make moot.
