# Goonpacks — persona pack format

Personas as a self-contained, portable bundle for one companion. This is the
**current** concept, deliberately simple — _not_ the inference-driven v2 library
system (that lives in [INFERENCE-LIBRARY.md](./INFERENCE-LIBRARY.md)). How packs
may (and may not) move around is set by the project's
[content policy](../DEVELOPERS.md#content-policy).

## The core idea

The differentiator isn't the images — it's integrating the **toy + the persona +
the images**. The app is a _player_ for persona content; the content is
bring-your-own. A goonpack is how one persona travels.

## What a goonpack is

A `.zip` containing everything one companion needs:

- **Images + embedded descriptions** — the pictures plus their pose/mood
  captions (the `describe-image` `.txt` sidecar text).
- **Voice prompt** — the ElevenLabs voice config for her voice.
- **System prompt** — her persona / behaviour.
- **Companion config** — id, display name, knob defaults, accent, etc.

Small and self-contained by design — a curated persona (Aimee-shape, ~50 images,
a few hundred absolute max), not a tagged library.

## Maps onto what already exists

A goonpack is just _the data half of a companion, serialised_. It lines up 1:1
with the current pieces:

- the keyed persona list (personas are already "pure data"),
- the `describe-image` `.txt` sidecars (the embedded descriptions),
- the shared-prompt sections + system prompt,
- the ElevenLabs voice.

So the built-ins (Elise, Aimee) are effectively **built-in goonpacks**; a
community goonpack is the same shape, imported.

## The one shift: build-time → runtime

Pictures are currently **baked in at build time** (`gen:pictures` →
`companion-pictures.generated.ts`). For an imported goonpack the same data has
to load at **runtime** instead. That's the real work of supporting packs:
build-time-baked personas → runtime-loaded persona packs.

## Distribution (in brief)

A goonpack is small enough to be a portable file people make and share however
they like — the app only ever **imports** one. Per the
[content policy](../DEVELOPERS.md#content-policy), the project never hosts,
indexes, links to, or recommends sources for packs; import-your-own-file is the
only path in.
