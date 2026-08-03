# Inference

A workbench for finding out how well a model describes a picture. It holds a
corpus of media, ground truth written by hand against it, and one directory of
code per experiment that tries to reproduce that ground truth. An experiment's
answers are scored against the labels; a change to a prompt, a model or a whole
pipeline is then a number rather than an impression.

It is **dev-only**. The tab appears under `npm run dev` and nowhere else, and
its routes answer nothing in any other build.

## The corpus

`inference-corpus/` at the repo root, gitignored, never committed. Media sits
flat in it, in the formats [`media.ts`](./src/lib/goonpacks/media.ts) lists, and
every other file is named from the item it belongs to:

    inference-corpus/
      2026-08-02-baseline.run.json           an experiment's parameters
      beach.jpg                              the media
      beach.2026-08-02-baseline.fields.json  that experiment's answers for it
      beach.2026-08-02-baseline.raw.txt      that experiment's reply, verbatim
      beach.labels.json                      ground truth

Sorted, an item's every file lands in one block, so one picture can be compared
across experiments in a file browser as readily as in the app.
[`paths.ts`](./src/inference/paths.ts) is the only reader of these names.

## Ground truth

One `.labels.json` per item, holding each answered field's value and the source
that gave it — `human`, or the id of the experiment that filled it:

    {
      "naked": { "value": true, "source": "2026-08-02-baseline" },
      "breastSize": { "value": "unknown", "source": "human" }
    }

A field nobody has answered is absent. An experiment fills only absent fields;
an answer given on screen always wins and is stamped `human`. Neither overwrites
the other, so replaying an old experiment back-fills a field added since without
disturbing anything already curated.

`unknown` is a value like any other, available on any field whose options
include it — a picture with no breasts in it has a `breastSize`, and an
experiment answering `large` there is one that got it wrong.

The fields and their options are in [`fields.ts`](./src/inference/fields.ts), in
the order the arrows walk them.

## The screen

The **Inference** tab, beside Goonpacks. It has no voice word: this is a
keyboard-driven desk tool rather than something operated during play.

The screen reports on the corpus for one experiment, picked from its dropdown:
how many items there are, how many a person has answered every field for, how
many still hold an experiment's answer, and how far the selected experiment has
run. The spread of the ground truth's own answers across each field's options is
counted beside them; it belongs to the corpus rather than to any experiment.

**Review** is a page of its own, not an overlay: the picture, the controls for
each field, and the selected experiment's reply to it. Every screen here has an
address, so an item can be linked, reloaded and left with the browser's back —
the grammar is in [`route.ts`](./src/inference/route.ts). Stepping between items
replaces the address rather than stacking it, so one press of back leaves review
rather than undoing one move through a thousand items. A breadcrumb top left
does the same.

| Key     |                                                     |
| ------- | --------------------------------------------------- |
| `↑` `↓` | move between the fields                             |
| `←` `→` | answer the focused field, along its options in turn |
| `Del`   | takes the focused field's answer back               |
| `a` `d` | previous and next item                              |
| `Enter` | the next item nobody has answered                   |
| `?`     | compare against pictures already labelled           |
| `g`     | run the selected experiment against this item       |

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

**Generate is one call for one item** — it is the spot-check. Running an
experiment across the whole corpus is `npm run experiment:run`, and re-running
the items an edit put out of date is `npm run experiment:run:outdated`. Both
take an experiment id, defaulting to the one the registry names, and both say
how many items they are about to run before starting.

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

`<experiment>.run.json` records what the last run used — model, resolution,
temperature — because a version is a hash and `qwen/qwen3-vl-235b-a22b-instruct`
is not. It is a record; the version is what says whether a result is current.

Adding one is a new directory, its `README.md`, and an entry in
[the registry](./src/inference/experiments/index.ts), which also names the one
the screen starts on.

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
