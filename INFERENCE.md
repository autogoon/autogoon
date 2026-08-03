# Inference

A workbench for finding out how well a model describes a picture. It holds a
corpus of media, ground truth written by hand against it, and one directory of
code per experiment that tries to reproduce that ground truth. An experiment's
answers are scored against the labels; a change to a prompt, a model or a whole
pipeline is then a number rather than an impression.

It is **dev-only**. The tab appears under `npm run dev` and nowhere else, and
its routes answer nothing in any other build.

## The corpus

**A corpus is a goonpack's `media/`.** There is no separate directory for one: a
corpus and a pack's media set are both a folder of pictures with per-item
metadata beside them, and keeping them apart meant building a zip and importing
it to see a labelled set in the app. Every pack source under `goonpacks/` whose
`media/` holds something to label is a corpus, and the screen picks between
them. Several corpora is several packs.

Media sits flat in `media/`, in the formats
[`media.ts`](./src/lib/goonpacks/media.ts) lists, and every file inference
writes is named from the item it belongs to:

    goonpacks/<pack>/media/
      beach.jpg                              the media
      beach.2026-08-02-baseline.fields.json  that experiment's answers for it
      beach.2026-08-02-baseline.raw.txt      that experiment's reply, verbatim
      beach.labels.json                      ground truth
      beach.md                               the pack's own sidecar

Sorted, an item's every file lands in one block, so one picture can be compared
across experiments in a file browser as readily as in the app.
[`paths.ts`](./src/inference/paths.ts) is the only reader of these names, and
what it doesn't recognise it leaves alone — the pack's sidecars are not its
business.

Ground truth is per-pack, which follows from where it sits: the same picture in
two packs is labelled twice, and the compare screen calibrates against one
pack's answers.

## Ground truth

One `.labels.json` per item, holding what a person answered and nothing else:

    {
      "breastSize": "unknown",
      "naked": true
    }

A field nobody has answered is absent. **An inference never writes here** — an
experiment's answers stay in its own `.fields.json` and are laid over these on
screen, so the same fact is never recorded twice and the two records can never
disagree. What an experiment says is a proposal; what is in this file is what
somebody decided. Deleting an answer returns the field to absent, and the
selected experiment's proposal for it shows again.

`unknown` is a value like any other, available on any field whose options
include it — a picture with no breasts in it has a `breastSize`, and an
experiment answering `large` there is one that got it wrong.

The fields and their options are in [`fields.ts`](./src/inference/fields.ts), in
the order the arrows walk them.

## The screen

The **Inference** tab, beside Goonpacks. It has no voice word: this is a
keyboard-driven desk tool rather than something operated during play.

Two dropdowns pick what is being looked at: the pack whose media is the corpus,
and the experiment. Both are remembered, so the tab opens where it was left, and
both are in the address — the grammar is in
[`route.ts`](./src/inference/route.ts).

Under them the screen reports on that corpus for that experiment: how many items
there are, how many a person has answered every field for, how many still hold
an experiment's answer, and how far the selected experiment has run. The spread
of the ground truth's own answers across each field's options is counted beside
them; it belongs to the corpus rather than to any experiment.

**Review** is a page of its own, not an overlay: the picture, the controls for
each field, and the selected experiment's reply to it. Every screen here has an
address, so an item can be linked, reloaded and left with the browser's back.
Stepping between items replaces the address rather than stacking it, so one
press of back leaves review rather than undoing one move through a thousand
items. A breadcrumb top left does the same.

| Key     |                                                      |
| ------- | ---------------------------------------------------- |
| `↑` `↓` | move between the fields                              |
| `←` `→` | answer the focused field, along its options in turn  |
| `Del`   | takes the focused field's answer back                |
| `a` `d` | previous and next item                               |
| `Enter` | the next item nobody has answered                    |
| `?`     | compare against pictures already labelled            |
| `i`     | infer: run the selected experiment against this item |

**Compare** answers "is this one Medium or Large?" the only way it can be
answered — against the pictures that were called Medium and Large before. `?`
puts the item beside one already labelled with the focused field's value, over a
strip of every other picture labelled the same. The exemplars are confirmed
answers only: an experiment's are the ones nobody has checked, so calibrating
against those would be calibrating against the thing being measured.

| Key     |                                            |
| ------- | ------------------------------------------ |
| `↑` `↓` | move between the field's values            |
| `←` `→` | move along that value's pictures           |
| `Enter` | answer with the value on screen, and leave |
| `Esc`   | leave without answering                    |

**Infer is one call for one item** — it is the spot-check. Running an experiment
across a whole corpus is `npm run experiment:run`, and re-running the items an
edit put out of date is `npm run experiment:run:outdated`:

    npm run experiment:run goonpacks/elise 2026-08-02-baseline

Both name the pack and the experiment, neither has an "every pack" form, and
both say how many items they are about to run before starting. This is one model
call per item, and a pack can hold thousands.

## Experiments

An experiment is a directory under
[`src/inference/experiments/`](./src/inference/experiments/), named
`<date>-<name>`, holding everything it needs: its own prompt, its own request,
and a `README.md` describing its approach and what it is known to get wrong.

Experiments are edited and re-run. A finding from one feeds back into an earlier
one, and several may be in flight at once, so what matters is not that an
experiment's code never changes but that the corpus says which code produced
which answers. Every result is stamped with a **version** — a hash of the
experiment's directory, described in
[`fingerprint.ts`](./src/inference/fingerprint.ts) — and results whose version
isn't the current one are counted as outdated on screen. A sweep of those items
clears it.

Each exports two functions, described in
[`experiment.ts`](./src/inference/experiment.ts):

- **`run()`** sends the image and costs money.
- **`parse()`** turns a stored reply into fields and costs nothing, so a parser
  that turns out to be wrong is fixed by re-deriving from the replies already on
  disk.

Every result records what its own run used — model, resolution, temperature —
because a version is a hash and `qwen/qwen3-vl-235b-a22b-instruct` is not. Items
are inferred one at a time over days and an experiment may be edited between two
of them, so the record sits with the result rather than with the experiment. It
is a record; the version is what says whether a result is current.

Adding one is a new directory, its `README.md`, and an entry in
[the registry](./src/inference/experiments/index.ts). No entry is the current
one — findings from one feed back into another, so the set is not a series with
a head, and the screen opens on whichever was last selected.

### The experiments

- **[2026-08-02-baseline](./src/inference/experiments/2026-08-02-baseline/README.md)**
  — one vision model, one call per image: a checklist of observations, then the
  naked flag, then a caption. Reproduces what the pack-authoring pipeline does,
  so everything after it has something to be better than.

## Running it

`npm run dev`, then the Inference tab. An experiment that calls a hosted model
needs its key in `.env` — the baseline reads `OPENROUTER_API_KEY`, and honours
`LLM_URL` for an OpenAI-compatible server. The baseline is macOS-only: its
downscale shells out to `sips`.
