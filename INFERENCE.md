# Inference

Inference measures how well a model describes a picture. It holds a corpus of
media, ground truth written by hand against it, and one directory of code per
experiment written to reproduce that ground truth. An experiment's answers are
scored against the labels. A change to a prompt, a model or a whole pipeline is
then a number rather than an impression.

It is **dev-only**. The tab appears under `npm run dev` and nowhere else. Its
routes answer nothing in any other build.

## The corpus

**A corpus is a goonpack's `media/`.** A corpus and a pack's media set are both
a folder of pictures with per-item metadata beside them, and keeping them apart
meant building a zip and importing it to see a labelled set in the app. Every
pack source under `goonpacks/` whose `media/` holds something to label is a
corpus, and the screen's pack dropdown selects between them.

Media sits flat in `media/`, in the formats
[`media.ts`](./src/lib/goonpacks/media.ts) lists, and every file inference
writes is named from the item it belongs to:

    goonpacks/<pack>/media/
      beach.jpg                              the media
      beach.2026-08-02-baseline.fields.json  that experiment's answers for it
      beach.2026-08-02-baseline.prompt.txt   what its first call asked
      beach.2026-08-02-baseline.raw.txt      what that call answered, verbatim
      beach.2026-08-02-baseline.prompt2.txt  its second call
      beach.2026-08-02-baseline.raw2.txt
      beach.2026-08-02-baseline.sidecar.md   the caption and description it wrote
      beach.labels.json                      ground truth
      beach.md                               the pack's own sidecar

**A prompt and its reply are stored as a pair, numbered by the call.** An
experiment may make several. The baseline looks at the picture, then reads its
own account of it. A reply says little without the question above it. The first
call carries no number, so an experiment that makes one call writes the names it
always did.

Everything an experiment writes there is the latest run's, overwritten by the
next. Each is written a second time under a name carrying when the run happened
and which version ran it:

    beach.2026-08-02-baseline.20260803154212.5a4919b862f2.raw.txt

The time comes first, so an item's runs read down the page in the order they
happened. The version follows it, and every archived file names the code that
made it. Nothing reads them back. They are there to be opened and compared by
hand.

Sorted, an item's every file lands in one block, so one picture can be compared
across experiments in a file browser. [`paths.ts`](./src/inference/paths.ts) is
the only reader of these names, and what it doesn't recognise, the pack's
sidecars included, it leaves alone.

Ground truth is per-pack. The same picture in two packs is labelled twice, and
the compare screen calibrates against one pack's answers.

## Ground truth

One `.labels.json` per item, holding what a person answered and nothing else:

    {
      "breastSize": "unknown",
      "hair": "dark, loose over one shoulder",
      "naked": true
    }

A field nobody has answered is absent. **An inference never writes here.** An
experiment's answers stay in its own `.fields.json` and are laid over these on
screen, so the same fact is never recorded twice and the two records can never
disagree. What an experiment says is a proposal; what is in this file is what
somebody decided. Deleting an answer returns the field to absent, and the
selected experiment's proposal for it shows again.

`unknown` is a value like any other, available on any field whose options
include it. A picture with no breasts in it has a `breastSize`, and an
experiment answering `large` there is one that got it wrong.

A field is either a **choice**, answered from a named set, or **text**, answered
in words. A choice is what can be scored, because an experiment's answer is
right or wrong against a person's. Nothing marks a text answer. It is recorded
because it is worth having beside the picture, not because it can be measured.

The caption and the description a pack plays are fields like the rest, so an
experiment's can be read against one somebody wrote. A description is
paragraphs, so its editor is a box rather than a line and Enter is a newline in
it. Escape or clicking away is how you leave.

The fields, their kinds and their options are in
[`fields.ts`](./src/inference/fields.ts), in the order the arrows step through
them.

## The screen

The **Inference** tab, beside Goonpacks. It has no voice word. This is a
keyboard-driven desk tool rather than something operated during play.

Two dropdowns pick what is being looked at: the pack whose media is the corpus,
and the experiment. Both are stored, so the tab opens where it was left, and
both are in the address. The grammar is in
[`route.ts`](./src/inference/route.ts).

Under them the screen reports on that corpus for that experiment: how many items
there are, how many a person has answered every field for, how many still hold
an experiment's answer, and how far the selected experiment has run. The spread
of the ground truth's own answers across each field's options is counted beside
them. It belongs to the corpus rather than to any experiment.

**Review** is a page of its own, not an overlay: the picture, the controls for
each field, and the selected experiment's reply to it. Every screen here has an
address, so an item can be linked, reloaded and left with the browser's back.
Stepping between items replaces the address rather than stacking it. One press
of back leaves review rather than undoing one move through a thousand items. A
breadcrumb top left does the same.

| Key     |                                                      |
| ------- | ---------------------------------------------------- |
| `↑` `↓` | move between the fields                              |
| `←` `→` | answer the focused field, along its options in turn  |
| `→`     | on a text field, open it for typing                  |
| `Del`   | takes the focused field's answer back                |
| `a` `d` | previous and next item                               |
| `Enter` | the next item nobody has answered                    |
| `?`     | compare against pictures already labelled            |
| `i`     | infer: run the selected experiment against this item |
| `r`     | reparse: read this item's stored reply again         |

`→` opens a **text field**, holding what you answered before or what the
experiment proposed if you haven't. Keeping the model's wording is `→` then
Enter. Enter or clicking away keeps what is typed, Escape leaves it as it was,
and an empty box takes the answer back. Compare does nothing on one. Its
exemplars are the items sharing a value, and no two descriptions share one.

Where nobody has answered a text field, the experiment's words stand in the row
underlined, as its answer does on a choice field. Where somebody has answered
and the experiment said something else, the row is theirs and an icon beside it
opens the two side by side over a dimmed page. A choice field shows both at
once, and two paragraphs cannot. Each has a button naming it, so the choice is
between two answers rather than between acting and not. Escape, the close icon
or a click away all leave.

**Compare** answers "is this one Medium or Large?" the only way it can be
answered — against the pictures that were called Medium and Large before. `?`
puts the item beside one already labelled with the focused field's value, over a
strip of every other picture labelled the same. The exemplars are confirmed
answers only. An experiment's are the ones nobody has checked, so calibrating
against those would be calibrating against the thing being measured.

| Key     |                                            |
| ------- | ------------------------------------------ |
| `↑` `↓` | move between the field's values            |
| `←` `→` | move along that value's pictures           |
| `Enter` | answer with the value on screen, and leave |
| `Esc`   | leave without answering                    |

**Infer runs one item.** It is the spot-check, and what it costs is whatever the
selected experiment does per picture. **Reparse** reads that item's stored reply
again and re-derives its fields and sidecar from it, with no model call. It is
how a parser that turns out to be wrong, or a field added to an experiment's
output, is fixed without paying twice. When the run happened, what ran it and
what that run asked for all stand. Only the answers change, because the reply
they were read from is the one that run produced.

Running an experiment across a whole corpus is `npm run experiment:run`, and
re-running the items an edit put out of date is
`npm run experiment:run:outdated`:

    npm run experiment:run goonpacks/elise 2026-08-02-baseline

Both name the pack and the experiment, and neither has an "every pack" form. A
pack can hold thousands.

**`experiment:run` brings a pack up to the experiment as it stands** — every
item it has never answered, and every item it answered before its last edit.
`experiment:run:outdated` takes only the second of those. Reach for it where the
gaps are deliberate and only the stale answers want redoing.

Both print the whole standing before they start — how many images, how many
answered, how many outdated, how many never run — and then what the run takes of
it. The narrow mode leaves a group behind, and a count on its own doesn't say
so. Each item then prints its caption and, in iTerm, the picture under it.

A third argument is how many items to have in flight:

    npm run experiment:run goonpacks/elise 2026-08-02-baseline 8

One by default, the sweep to watch. A number is what to reach for once a run is
long enough to leave going. A pack of thousands at one call at a time is hours.
The first failure stops new items being taken. Whatever was already in flight is
paid for, so it is allowed to land.

They go in **random order**. Filename order is not a random sample of a pack, so
a sweep that stopped part-way through it would have covered whatever sorts
first. Those are the items the compare screen would then be calibrating against.
Running again picks up where the last one stopped, since an item the experiment
has already answered is skipped.

## Playing what an experiment described

`npm run goonpack:build` takes the same two arguments in the same order, and
builds a pack whose captions and descriptions are that experiment's:

    npm run goonpack:build goonpacks/elise 2026-08-02-baseline

**Media with no sidecar** is left out, since a picture nothing can describe is
one no companion can pick. The build prints how many it dropped. So is
**everything else inference wrote**: the labels, the replies, the prompts, the
fields, and each run's own copy of the four.

Named that way it is strictly that experiment's work. An item it never described
is left out rather than falling back to the stock sidecar, so two packs built
from two experiments differ only in the thing being compared. Without it the
build takes `<stem>.md`, the stock sidecar — whatever wrote it,
`goonpack:describe` or an author.

`npm run goonpack:summarise` takes the same pair, and writes the `mediaSummary`
from that experiment's captions:

    npm run goonpack:summarise goonpacks/elise 2026-08-02-baseline

Run it before the build. The summary is how a companion knows what is worth
asking for, so one written from a different experiment's captions offers words
the set no longer uses. A corpus with no stock sidecars at all has no summary to
build from until an experiment is named.

### Playing one without building it

On a dev server you don't have to build anything. Every pack source under
`goonpacks/` — every directory with a `manifest.json` — is offered on the
Companions screen as it sits, and its card carries a **Descriptions** select for
which sidecars to play it with. Change it and the directory is read again.

**A pack source is not an experiment's.** It is a directory of media, and beside
each item sit as many sidecars as have been written about it: the stock
`<stem>.md`, and one per experiment that has answered it. Choosing an experiment
chooses which of those to read.

**What each select decides.** A card carries whichever of these it has a choice
to offer — Base only where more than one version is installed, Overlay only
where the companion has any, Descriptions only for a pack read off disk:

| Select       | The question                          |
| ------------ | ------------------------------------- |
| Base         | which version of the companion        |
| Overlay      | what is laid on top, media included   |
| Descriptions | which sidecars the media is read with |

Descriptions is answered after Overlay, because Overlay settles _where the media
comes from_. Descriptions then applies to whichever directory that leaves.
Worked through:

- **Elise, no overlay.** The media is the `elise` directory's, so Descriptions
  reads `elise`: Stock plays the items with a `<stem>.md` beside them,
  `2026-08-02-baseline` the items that experiment described.
- **Elise plus a prompt-only overlay** (`my-packs.elise-rewrite`, which rewrites
  how she talks and brings no pictures). The media is still `elise`'s, so
  Descriptions is still about `elise`. The overlay's own directory has nothing
  to describe and is never asked about.
- **Elise plus an overlay carrying its own set** (a beach shoot, say). That set
  replaces hers, so the media now comes from the overlay's directory, and
  Descriptions is about _that_ one. Whatever `elise` was set to stops mattering
  while this overlay is selected.
- **Elise plus an overlay that strips the media** (`noMedia`). Nothing is
  played, so there is nothing to describe and no Descriptions select at all.
- **An imported pack.** Read out of browser storage, where a pack carries one
  set of descriptions baked in at build time. No disk icon, and no Descriptions
  select.

The choice is stored per directory and kept across a reload. A reload is how a
change to a pack source reaches the app.

## Experiments

An experiment is a directory under
[`src/inference/experiments/`](./src/inference/experiments/), named
`<date>-<name>`, holding everything it needs: its own prompt, its own request,
and a `README.md` describing its approach and what it is known to get wrong.

Experiments are edited and re-run. A finding from one feeds back into an earlier
one, and several may be in flight at once. What matters is not that an
experiment's code never changes but that the corpus says which code produced
which answers. Every result is stamped with a **version**, a hash of the
experiment's directory, described in
[`fingerprint.ts`](./src/inference/fingerprint.ts). Results whose version isn't
the current one are counted as outdated on screen. A sweep of those items clears
it.

Each exports two functions, described in
[`experiment.ts`](./src/inference/experiment.ts):

- **`run()`** sends the image and costs money. It answers with what it sent as
  well as what came back, since an experiment that feeds one call's reply into
  the next call's prompt has no static prompt to record.
- **`parse()`** turns a stored reply into everything derived from it and costs
  nothing.

`parse()` answers with both the fields and a **sidecar** — the caption and
description in the pack's own format
([`sidecar.ts`](./src/lib/goonpacks/sidecar.ts)) — from one pass over the reply.
No item ends up with fields and nothing saying what they were read from. Each
experiment writes its own, named `<stem>.<experiment>.sidecar.md`. Which of them
a pack plays is a separate question, answered under Playing what an experiment
described.

Every result records what its own run used — the models, the resolution, the
temperature — because a version is a hash and a model slug is not. The prompt is
written beside it for the same reason. An experiment that sends the picture to
one model and that model's reply to another records both, so which pair produced
an answer is read off the answer. Items are inferred one at a time over days,
and an experiment may be edited between two of them. All of it sits with the
result rather than with the experiment.

Adding one is a new directory, its `README.md`, and an entry in
[the registry](./src/inference/experiments/index.ts). No entry is the current
one.

### The experiments

- **[2026-08-02-baseline](./src/inference/experiments/2026-08-02-baseline/README.md)**
  — two calls per image, to two models: a vision model reasons about the
  picture, then a text model reads that reasoning with no picture and answers a
  checklist, the naked flag and a caption. Started as what the pack-authoring
  pipeline does, so everything after it has something to be better than.

## Running it

`npm run dev`, then the Inference tab. An experiment that calls a hosted model
needs its key in `.env`. The baseline reads `OPENROUTER_API_KEY`, and uses
`LLM_URL` for an OpenAI-compatible server. The baseline is macOS-only: its
downscale shells out to `sips`.
