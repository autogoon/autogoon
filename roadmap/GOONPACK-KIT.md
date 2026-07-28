# Goonpack kit

Move goonpack authoring — creating, captioning, checking, building — out of the
npm scripts and a text editor, and into the app itself as a screen you work in.

The app today only _consumes_ packs: import a zip, and it lives in browser
storage. Everything that goes into making one happens elsewhere — captions come
from `scripts/describe-image.ts`, the manifest and `system-prompt.md` are hand-
edited files, and `goonpack:build` zips a directory. That split is the problem:
the one job that genuinely needs a screen is looking at a picture next to what a
model said about it.

## Why captions come first

Captioning is good but never perfect, and it can't be — a single frame is
sometimes genuinely ambiguous, and a model that gets a pose right on one run
gets it wrong on the next. So there will always be captions to correct and small
tweaks to make, whatever the pack's size, and doing that in a terminal means
running one script per picture; the inline-image preview the describe scripts
print is a workaround for not having a screen.

So the first piece is a review surface: pick a pack, leaf through its pictures,
see each one beside its caption and the model's full observations, jump into the
caption with a keystroke, and save. Fast leafing and keyboard editing are the
whole point — the value is in how quickly you can get through a lot of pictures.

**What changes as a pack grows.** Reading every caption is the right workflow
while a pack is a curated few hundred. Past that nobody will read them all — see
the two regimes in [INFERENCE-LIBRARY.md](./INFERENCE-LIBRARY.md) — and the
kit's main jobs become the ones that scale: running the description pass over a
whole pack and watching it work, creating the voice, and packaging the result.
Review doesn't go away, it stops being exhaustive: you go to the pictures a
sampling pass or a search flags, rather than to all of them.

## The pieces

Each is a spec's worth of work on its own, roughly in the order they earn their
keep:

- **Caption review** — leaf, compare, edit, save.
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

Nothing in `src/` touches the filesystem today: every API route is a network
proxy, and packs reach the app as uploaded zips. A kit that edits pictures and
sidecars where they actually live would be the app's first filesystem route —
and it can only exist on the machine holding the pack sources, which means
**dev-only**, present under `npm run dev` and absent from any deploy.

That gating is the first design question, and it is not just a feature flag: the
routes must not be reachable in a deployed build at all. Worth settling before
anything else, because it decides whether the editing logic can assume a
directory or has to assume a zip.

Open questions:

- **Where the observations live.** Answered elsewhere: the sidecar becomes a
  `.md` per item carrying the caption in frontmatter and the model's full notes
  as the body, so reviewing a caption beside what it was condensed from comes
  free. See
  [the design](../docs/superpowers/specs/2026-07-27-media-search-design.md).
- **What happens to the scripts.** `describe`, `describe-missing` and `build`
  either become thin wrappers over shared code the screen also uses, or stay as
  they are and the screen duplicates them. Sharing is better and needs the
  captioning logic to move out of `scripts/`.
- **Re-captioning from the screen** — one picture, or a selection — which puts a
  paid API call behind a button and needs the model choice surfaced.
