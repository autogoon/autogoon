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

The fields, their options and the key that picks each one are in
[`fields.ts`](./src/inference/fields.ts).

## The screen

The **Inference** tab, beside Goonpacks. It has no voice word: this is a
keyboard-driven desk tool rather than something operated during play.

- **The corpus's counts** — how many items, how many every field has a person's
  answer for, how many still hold an experiment's, and how far each experiment
  has run.
- **One item at a time** — the picture, the controls for each field, and the raw
  reply of any run against it.

| Key                  |                                              |
| -------------------- | -------------------------------------------- |
| the option's own key | answers that field                           |
| `←` `→`              | previous and next                            |
| `u`                  | the next item nobody has answered            |
| `g`                  | run the current experiment against this item |

**Generate is one call for one item** — it is the spot-check. Running an
experiment across the whole corpus is a script, not a button.

## Experiments

An experiment is a directory under
[`src/inference/experiments/`](./src/inference/experiments/), named
`<date>-<name>`, holding everything it needs: its own prompt, its own request,
and a `README.md` describing its approach and what it is known to get wrong. It
is **frozen once it has run** — a different model, resolution or prompt is a new
directory rather than an edit, because its recorded output only means anything
while the code that produced it cannot change.

Each exports two functions, described in
[`experiment.ts`](./src/inference/experiment.ts):

- **`run()`** sends the image and costs money.
- **`parse()`** turns a stored reply into fields and costs nothing, so a parser
  that turns out to be wrong is fixed by re-deriving from the replies already on
  disk.

The values an environment override could change — model, resolution, temperature
— are written to `<experiment>.run.json` the first time it runs. A run that
would differ from them is refused, naming what moved.

Adding one is a new directory, its `README.md`, and an entry in
[the registry](./src/inference/experiments/index.ts), which also names the
experiment the screen's Generate button runs.

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
