# Inference UI v1 — labelling a corpus

A dev-only screen for building the ground truth that
[describe-accuracy](./2026-08-02-describe-accuracy.md) says every later
experiment has to be scored against. That file records what the current
descriptions get wrong; this one records what gets built.

v1 does one thing: leaf through a corpus of images in the browser, run a
baseline description of one, and record by hand whether the subject is naked.

This is not [Goonpack kit](../roadmap/GOONPACK-KIT.md), which authors packs —
its review surface edits a caption so a pack reads better. This one records what
is true so a model can be scored, and its output never reaches a pack. The two
want the same leafing surface and may converge later; nothing here assumes they
will.

## The corpus

A corpus is a goonpack's `media/`, and the screen picks which pack's. The two
were the same thing under different names — a folder of pictures with per-item
metadata beside them — and holding them apart meant a zip and an import stood
between a labelled set and playing it. [INFERENCE.md](../INFERENCE.md) is the
current-state description; the layout is unchanged apart from where it sits.

    goonpacks/<pack>/media/
      beach.jpg                              the media
      beach.2026-08-02-baseline.fields.json  that experiment's answers for it
      beach.2026-08-02-baseline.prompt.txt   what it asked
      beach.2026-08-02-baseline.raw.txt      that experiment's reply, verbatim
      beach.2026-08-02-baseline.sidecar.md   the caption and description it wrote
      beach.labels.json                      ground truth

Media extensions are the ones [`media.ts`](../src/lib/goonpacks/media.ts)
already names, so a corpus item is a file a pack could have carried. v1 reads
images only.

Everything is flat, and every filename starts with the item's basename, so an
item's media, its ground truth and each experiment's answers about it sort into
one contiguous block. Comparing one picture across experiments is then arrowing
down a list in a file browser, and discarding an experiment is a glob. The
storage stays legible to tools that aren't this app — which is worth keeping
even once the screen is good, because a good screen hides the layout anyway.

### Scale

The ground truth is a picked subset of the corpus, but not a small one: twenty
instances of each case across twenty fields is four hundred items before a
single edge case, and edge cases are most of what a yardstick is for. A labelled
set in the low thousands is where this ends up, in a directory holding more
pictures than that and, with several experiments run, several times as many
files again.

So the tool has to be quick at both ends — listing thousands of items, and
taking thousands of answers by hand. The second is why Review is driven from the
keyboard rather than by clicking: at a thousand items a saved keystroke is an
hour.

The flat layout is what makes that cheap. **The listing is one `readdir`**, with
every item's state read off the filenames: no `stat` per item, nothing opened to
discover whether it exists. Only files the listing already proves are there get
read, so a few hundred labels cost a few hundred small reads however many
pictures sit beside them.

Moving between items loads one picture, and the next is fetched before it is
asked for.

### Ground truth

    {
      "breastSize": "unknown",
      "naked": true
    }

One record per item, holding what a person answered and nothing else.

**An absent field is one nobody has answered.** An inference writes no ground
truth: its answers stay in `<stem>.<experiment>.fields.json` and the screen lays
them over the labels, so no fact is recorded twice and no source stamp is needed
to tell the two apart. What an experiment says is a proposal; what is here is
what somebody decided.

Three things follow from keeping them in separate files: the review screen lists
the fields holding only a proposal as a worklist rather than an invisible state,
scoring reads the labels alone, and an experiment can never be scored against
its own output.

`unknown` is a value like any other, not a state — an option in the enum of any
field that needs one. A picture with nobody's breasts in it has `breastSize`
`unknown`, and a run answering `large` there is a run that got it wrong, which
is exactly what the corpus has to be able to say.

### Run output

Four files per item: what was asked, what came back, and the two things derived
from the reply.

**`<item>.<experiment>.prompt.txt`** — what the experiment sent.

**`<item>.<experiment>.raw.txt`** — the reply verbatim, before anything reads
it. A plain file rather than a string inside JSON: it is prose, and reading it
is how a wrong field gets diagnosed. A later experiment whose raw output isn't
text writes whatever form it has.

**`<item>.<experiment>.sidecar.md`** — the caption and description, in the
pack's own sidecar format. Writing it here is what makes a labelled pack a
playable one, and carrying the experiment id in the name is what lets several
descriptions of one picture sit beside each other. `parse()` returns it with the
fields from one pass, so an item never has fields and nothing saying what they
were read from.

**`<item>.<experiment>.fields.json`** — what scoring reads:

    {
      "ranAt": "2026-08-02T14:22:31.004Z",
      "version": "5a4919b862f2",
      "parameters": {
        "model": "a-vision-model",
        "textModel": "a-text-model",
        "maxEdge": 1024,
        "temperature": 0
      },
      "fields": { "naked": true }
    }

`fields` is **derived** from the raw reply, so a parser that turns out to be
wrong, or a field added to an existing experiment's output, is re-derived from
disk across the whole corpus without calling a model again.

**Each record carries its own parameters**, rather than one file per experiment
holding them. Items are inferred one at a time over days and an experiment may
be edited between two of them, so a single record could only describe the last
run. The `version` beside them identifies the code that produced the answers and
cannot be read back into a model name, which is what the parameters are for: the
question always arrives at a result, and the result answers it alone.

**The prompt is written beside the reply**, not left to the experiment's
directory. That directory is edited between runs, so it is the current prompt
rather than the one any given result was produced under, and recovering an
earlier one means matching a hash against git by hand.

**Each of the four is written twice**: once under the plain name, which is the
latest and the only one anything reads, and once under
`<item>.<experiment>.<YYYYMMDDHHmmss>.<version>.<kind>`. Time first so an item's
runs sort in the order they happened, version second so every archived file
names the code that made it rather than only `fields.json` carrying it inside.
The archive is for reading by hand; nothing parses it, and `readName` knows the
shape only so that the module writing these names can also recognise them.

## Experiments

`src/inference/experiments/<date>-<name>/`, committed, one directory per
experiment, **frozen once it has run**. Its recorded output only means anything
if the code that produced it cannot change underneath it, so a later experiment
copies from an earlier one rather than editing it.

That puts the shared/local line at **affects the output or doesn't**. Shared
code may own the API call, retries and file IO; it may hold no value that
changes what a model returns. Each experiment states its own model, resolution
and prompt.

An experiment exports two functions, and the split is what makes the stored raw
reply worth keeping. **`run()`** sends the image and costs money, over as many
calls as the experiment wants; it answers with what it sent as well as what came
back, because an experiment feeding one call's reply into the next call's prompt
has no static prompt to record. **`parse()`** turns a stored reply into the
fields and the sidecar, and costs nothing, so a parser that turns out to be
wrong is fixed by walking the corpus calling `parse()` alone. Both derivations
come from the one call rather than two, so a broken caption reader stops an item
being recorded at all rather than leaving it scored and undescribed. A registry
beside them maps id to module; it grows with each experiment and is not frozen,
because it holds nothing that changes an output.

**Each experiment carries a `README.md` describing its approach**: what it does,
what it was derived from, and what it is known to get wrong. A directory of
frozen code is unreadable a year later without one, and the reason an experiment
was tried is exactly what its diff against the one before it cannot show.

### The first one

`2026-08-02-baseline/` starts from what runs today: the prompt, the `sips`
downscale and the OpenRouter call from
[`describe-image.ts`](../scripts/describe-image.ts), copied rather than shared.

**`describe-image.ts` is not changed.** It stays the pack-authoring tool it is,
and the experiment is free to diverge from it immediately — which it does; its
own [README](../src/inference/experiments/2026-08-02-baseline/README.md) is the
account of how far.

Nothing lifts out of `scripts/`. `GOONPACK-KIT.md` proposes eventually sharing
the captioning logic between the scripts and the screen; that trade is worth
making once the screen exists, not before.

## Code layout

The tool is a vertical slice under `src/inference/`, deliberately unlike the
rest of `src/`, which is organised by kind with one directory per feature under
`src/lib/`. The justification is that this is a separate tool rather than part
of the app: it ships to nobody, it accumulates frozen code forever, and one day
it is lifted out whole.

    src/inference/
      panel.tsx                        the screen
      use-corpus.ts                    listing, current item, calls the routes
      paths.ts                         the filename conventions, in one place
      corpus.ts                        what exists on disk for an item
      labels.ts                        ground truth: what a person answered
      runs.ts                          fields.json: a result and what made it
      experiments/
        index.ts                       the registry
        2026-08-02-baseline/

    src/app/api/inference/…/route.ts   thin; the one part that can't live above

The routes are the exception because Next routes by file path. They parse a
request, call into `src/inference/`, and hold no logic of their own.

`panel.tsx` runs in the browser and the modules below it use node's filesystem.
The boundary between them is the routes: the panel reaches the disk over
`fetch`, never by importing them.

Everything sits under `src/`, so `tsconfig.json`, `jest.config.mjs`, the
`format` globs and eslint all reach it with no config change — which is the
practical reason not to put experiments at the repo root.

`paths.ts`, `labels.ts` and `runs.ts` carry the logic worth testing: the
filename conventions, what a labels file may hold, and the refusal of a result
that says nothing about what produced it. Each experiment's `parse()` is tested
against a stored reply, which needs no network.

## The screen

A fourth top-level tab, **Inference**, beside Goonpacks in the strip
([`page.tsx`](../src/app/page.tsx)).

- **Dev-only**, on `IS_DEV` alone — it is not a Companions feature and does not
  follow the access gate. An `#inference` deep-link in any other build lands
  home.
- **No voice word.** The app is voice-first for controls used during play; this
  is a keyboard-driven desk tool, and the tab strip's grammar is a fixed list
  that Inference stays out of.

Two views:

- **Summary** — how many items, how many the baseline has run against, and per
  field how many answers are confirmed against how many still hold an
  experiment's. A labelled count far below the item count is the ordinary state,
  not a backlog.
- **Review** — one item at a time, large. The picture, the label controls, the
  raw reply from any run against this item, a **Generate** button, and two ways
  to move: **next** steps through the corpus in order, **next unlabelled** skips
  to the next item nobody has answered. Reviewing everything and working through
  what's unanswered are both real, so neither replaces the other.

**Infer** runs the baseline for that item and writes what it produced, touching
no ground truth. A control showing an experiment's answer reads differently from
one showing yours, so confirming a proposal is a distinct act from leaving it —
a field is never promoted to an answer by moving on.

Infer stays per item — it is the spot-check. Running an experiment across the
corpus is a script rather than a button, because it is thousands of paid calls
and nothing that costs that should start on a click.

## Routes

`src/app/api/inference/`, all `runtime = 'nodejs'`:

- **`GET packs`** — the pack sources holding a corpus, and the experiments that
  can be run over one: what the screen chooses between before it can ask for
  anything else.
- **`GET items`** — the corpus listing: file, kind, whether it has ground truth,
  whether the baseline has output.
- **`GET media`** — the bytes of one item, since the browser cannot read the
  disk.
- **`GET labels` / `PUT labels`** — one item's ground truth.
- **`POST run`** — run the selected experiment against one item and write what
  it produced. This is the only route that spends money.
- **`POST reparse`** — derive one item's fields and sidecar again from the reply
  already stored, with no model call. A route of its own rather than a mode of
  `run`, so the free path and the paid one cannot be reached by the same request
  with a flag wrong.

Two constraints on all of them:

- **They answer nothing outside `npm run dev`.** `GOONPACK-KIT.md` calls the
  gating "the first design question, and it is not just a feature flag". v1
  answers it with a 404 on `NODE_ENV !== 'development'` in every handler, and by
  keeping every path they touch under a pack's `media/`. The routes are still
  present in a deployed bundle; excluding them from the build is not attempted
  here.
- **No name from the client is ever joined to a path.** A pack is matched
  against the pack sources and a filename against that pack's listing, each
  rejected if absent, so no request can name a file outside a pack's `media/`.

## Not in v1

- Any field but `naked`.
- Batch running an experiment over the corpus.
- Scoring, diffing two runs, or any comparison view.
- Video, and everything keyframing needs.
- Captions and `mediaSummary` as scored steps of their own.
