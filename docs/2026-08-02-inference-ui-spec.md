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
      2026-08-02-baseline.run.json           one experiment's parameters
      beach.jpg                              the media
      beach.2026-08-02-baseline.fields.json  that experiment's answers for it
      beach.2026-08-02-baseline.raw.txt      that experiment's reply, verbatim
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
      "naked": { "value": true, "source": "2026-08-02-baseline" },
      "breastSize": { "value": "unknown", "source": "human" }
    }

One record per item. Each field carries its value and where the value came from:
the id of the experiment that filled it, or `human`.

**An absent field is one nobody has answered.** A run fills only absent fields,
and stamps its own id; answering a field on screen stamps `human`. Neither ever
overwrites the other, so a run can be replayed over a corpus at any time to fill
whatever a newly added field left blank, and everything already curated stands.

Three things follow from the stamp, all of which are unreconstructable if it
isn't recorded at the time: the review screen can list the fields still holding
an experiment's answer as a worklist rather than an invisible state, scoring can
be told to read confirmed fields only, and an experiment is never scored against
its own output.

`unknown` is a value like any other, not a state — an option in the enum of any
field that needs one. A picture with nobody's breasts in it has `breastSize`
`unknown`, and a run answering `large` there is a run that got it wrong, which
is exactly what the corpus has to be able to say.

### Run output

Three files, because the three have different lifetimes.

**`<experiment>.run.json`** — the parameters, written when the experiment first
runs against anything:

    {
      "model": "qwen/qwen3-vl-235b-a22b-instruct",
      "maxEdge": 1024,
      "temperature": 0
    }

They belong to the experiment rather than to each item, so they are recorded
once. Keeping that true needs one rule: **a run whose parameters differ from the
recorded ones is refused.** A different model or resolution is a different
experiment, which is the frozen-experiment rule applied to the values the code
doesn't hold. Without the refusal a hoisted record would describe neither run,
since v1 generates one item at a time over days.

**`<item>.<experiment>.raw.txt`** — the reply verbatim, before anything reads
it. A plain file rather than a string inside JSON: it is prose, and reading it
is how a wrong field gets diagnosed. A later experiment whose raw output isn't
text writes whatever form it has.

**`<item>.<experiment>.fields.json`** — what scoring reads:

    {
      "ranAt": "2026-08-02T14:22:31.004Z",
      "commit": "ef88374",
      "fields": { "naked": true }
    }

`fields` is **derived** from the raw reply, so a parser that turns out to be
wrong, or a field added to an existing experiment's output, is re-derived from
disk across the whole corpus without calling a model again. `ranAt` and `commit`
sit here rather than with the parameters because they genuinely differ per item
and nothing is wrong when they do.

The prompt is in none of the three: the experiment's own directory is committed
and frozen, so it already is the copy. What has to be recorded is what could
vary between two runs of the same code — model, resolution and temperature are
environment overrides today, so two runs at one commit can otherwise differ
completely with nothing to show it.

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
reply worth keeping. **`run()`** sends the image and costs money. **`parse()`**
turns a stored reply into fields and costs nothing, so a parser that turns out
to be wrong is fixed by walking the corpus calling `parse()` alone. A registry
beside them maps id to module; it grows with each experiment and is not frozen,
because it holds nothing that changes an output.

**Each experiment carries a `README.md` describing its approach**: what it does,
what it was derived from, and what it is known to get wrong. A directory of
frozen code is unreadable a year later without one, and the reason an experiment
was tried is exactly what its diff against the one before it cannot show.

### The first one

`2026-08-02-baseline/` reproduces what runs today: the prompt, the `sips`
downscale and the OpenRouter call from
[`describe-image.ts`](../scripts/describe-image.ts), copied rather than shared.

**`describe-image.ts` is not changed.** It stays the pack-authoring tool it is,
and the experiment is free to diverge from it immediately — which it does, by
one line: the reply opens with `naked: true` or `naked: false` on its own line,
parsed off before the observations.

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
      labels.ts                        ground truth: read, write, fill-only-absent
      runs.ts                          run.json and the refusal rule, fields.json
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
filename conventions, the fill-only-absent merge, and the refusal of a run whose
parameters differ from the recorded ones. Each experiment's `parse()` is tested
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

**Generate** runs the baseline for that item: it writes the run record, and
writes into ground truth only the fields nothing has answered yet. A control
showing an experiment's answer reads differently from one showing yours, so
confirming a seeded value is a distinct act from leaving it — a field is never
promoted to `human` by moving on.

Generate stays per item — it is the spot-check. Running an experiment across the
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
- **`POST run`** — run the baseline against one item, write its three files,
  fill any unanswered ground-truth field, and return both.

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
