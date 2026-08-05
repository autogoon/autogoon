# Goonpack kit

Move goonpack authoring — creating, captioning, checking, building — out of the
npm scripts and a text editor, and into the app itself as a screen.

Making a pack still happens outside the app:

- Captions come from `scripts/describe-image.ts`.
- The `mediaSummary` comes from `scripts/summarise-pack.ts`.
- The manifest and `system-prompt.md` are hand-edited files.
- `goonpack:build` zips a directory.

That split is the problem. The one job that needs a screen is looking at a
picture next to what a model said about it.

## Why captions come first

Captioning is good but never perfect, and it can't be. A single frame is
sometimes ambiguous, and a model that gets a pose right on one run gets it wrong
on the next. So there will always be captions to correct and small tweaks to
make, whatever the pack's size. Doing that in a terminal means running one
script per picture, and the inline-image preview the describe scripts print is a
workaround for not having a screen.

So the first piece is a review surface. Pick a pack, leaf through its pictures,
see each one beside its caption and the model's full observations, jump into the
caption with a keystroke, and save. The Inference tab
([INFERENCE.md](../INFERENCE.md)) is most of that already. What it doesn't do is
write the pack's own `<stem>.md`: every file it writes is named for the
experiment that produced it, so there is no way to sit down with a pack and fix
a caption — [TODO.md](../TODO.md) → Let the Inference screen write a plain
sidecar.

**What changes as a pack grows.** Reading every caption is the right workflow
while a pack is a curated few hundred. Past that nobody will read them all — see
the two regimes in [INFERENCE-LIBRARY.md](./INFERENCE-LIBRARY.md). The kit's
main jobs become the ones that scale: running the description pass over a whole
pack and watching it work, creating the voice, and packaging the result. Review
doesn't go away, it stops being exhaustive. You go to the pictures a sampling
pass or a search flags, rather than to all of them.

## The pieces

Each is a spec's worth of work on its own, roughly in the order they earn their
keep:

- **Caption review** — leaf, compare, edit, save. Built on the Inference tab,
  bar the plain sidecar.
- **Describing a whole pack** — run the description pass over everything without
  a caption, with progress, cost and failures on screen, and the model choice in
  front of you. This is the job that dominates once a pack is collected rather
  than curated.
- **Manifest authoring** — the fields in [GOONPACKS.md](../GOONPACKS.md), edited
  against a live preview of the card the pack will show.
- **Voice** — choosing a companion's voice, and eventually designing one from a
  written description rather than pasting an id (the Phase 2 follow-up in
  [TODO.md](../TODO.md#goonpacks)).
- **Persona editing** — `system-prompt.md`, with the shared scaffolding the app
  wraps around it visible so you can see what they're actually sent.
- **Picture management** — add, remove, and spot near-duplicates (an embedding
  pass would do it; see [INFERENCE-LIBRARY.md](./INFERENCE-LIBRARY.md)).
- **Build and validate** — what `goonpack:build` does, plus the import checks
  reported as you edit rather than at zip time.

## The constraint that shapes it

A kit that edits pictures and sidecars where they actually live can only exist
on the machine holding the pack sources, so it is **dev-only** — present under
`npm run dev`, absent from any deploy.

That gating is settled and built. `src/inference/dev-only.ts` gates every
`api/inference` route on `NODE_ENV`, each handler answering 404 before it reads
its request, and `src/lib/goonpacks/disk-source.ts` builds a library over pack
source directories through those routes — so the editing logic assumes a
directory, not a zip. What it does not do is keep the handlers out of a deployed
bundle, recorded as a limitation in
[the inference UI spec](../docs/2026-08-02-inference-ui-spec.md).

Open questions:

- **Where the observations live.** Answered elsewhere: the sidecar is a `.md`
  per item carrying the caption in frontmatter and the model's full notes as the
  body, so reviewing a caption beside what it was condensed from comes free.
- **What happens to the scripts.** `describe`, `describe-missing` and `build`
  either become thin wrappers over shared code the screen also uses, or stay as
  they are and the screen duplicates them. Sharing is better and needs the
  captioning logic to move out of `scripts/`.
- **Re-captioning a selection.** One picture from a button is built (`i` on the
  Inference tab, `src/app/api/inference/run/route.ts`); a selection, and the
  model choice surfaced beside it, are what is left.
