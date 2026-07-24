# Goonpack kit

Move goonpack authoring — creating, captioning, checking, building — out of the
npm scripts and a text editor, and into the app itself as a screen you work in.

The app today only _consumes_ packs: import a zip, and it lives in browser
storage. Everything that goes into making one happens elsewhere — captions come
from `scripts/describe-image.mjs`, the manifest and `system-prompt.md` are hand-
edited files, and `goonpack:build` zips a directory. That split is the problem:
the one job that genuinely needs a screen is looking at a picture next to what a
model said about it.

## Why captions come first

Captioning is good but never perfect, and it can't be — a single frame is
sometimes genuinely ambiguous, and a model that gets a pose right on one run
gets it wrong on the next. Reading every caption and correcting the few that are
wrong is the correct workflow at pack scale, not a fallback for a bad prompt
(the same conclusion [INFERENCE-LIBRARY.md](./INFERENCE-LIBRARY.md) reaches
about scale). Doing that in a terminal means running one script per picture; the
inline-image preview the describe scripts print is a workaround for not having a
screen.

So the first piece is a review surface: pick a pack, leaf through its pictures,
see each one beside its caption and the model's full observations, jump into the
caption with a keystroke, and save. Fast leafing and keyboard editing are the
whole point — the value is in how quickly you can get through a few hundred
pictures.

## The pieces

Each is a spec's worth of work on its own, roughly in the order they earn their
keep:

- **Caption review** — leaf, compare, edit, save.
- **Manifest authoring** — the fields in [GOONPACKS.md](../GOONPACKS.md), edited
  against a live preview of the card the pack will show.
- **Persona editing** — `system-prompt.md`, with the shared scaffolding the app
  wraps around it visible so you can see what she's actually sent.
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

- **Where the observations live.** The sidecar holds one caption line; the
  model's full notes are printed and thrown away. Reviewing a caption is far
  easier with them, so they'd need storing — a second sidecar, or a change to
  the pack format, which is a compatibility question.
- **What happens to the scripts.** `describe`, `describe-missing` and `build`
  either become thin wrappers over shared code the screen also uses, or stay as
  they are and the screen duplicates them. Sharing is better and needs the
  captioning logic to move out of `scripts/`.
- **Re-captioning from the screen** — one picture, or a selection — which puts a
  paid API call behind a button and needs the model choice surfaced.
