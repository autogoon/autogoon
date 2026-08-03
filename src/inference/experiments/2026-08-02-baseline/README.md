# 2026-08-02-baseline

The first experiment: one vision model, two calls per image, describing a single
subject in prose and then answering whether she is naked. It exists so that
everything after it has something to be measured against, so it changes only
where it is wrong about its own intent — a better idea belongs in a new
experiment, where it can be scored against this one.

## Model and parameters

|             |                                                                       |
| ----------- | --------------------------------------------------------------------- |
| Looking     | a vision model, sent the picture — the slug is in `index.ts`          |
| Reading     | a text model, sent that reply — likewise                              |
| Endpoint    | OpenRouter's chat completions API, or `LLM_URL` if set                |
| Temperature | 0                                                                     |
| Image       | downscaled to a long edge of 1024px, re-encoded as JPEG at quality 80 |

**Two models, because the two calls need different things.** Only the first is
sent a picture, so only it needs to see; the second is handed text, where the
field of models is larger, cheaper and quicker, and nothing is paid for an image
tower that goes unused. Both are recorded on every result (`runs.ts`), so which
pair produced an answer is read off the answer.

Temperature 0 makes two runs of this experiment comparable, so a re-run measures
how much a hosted model drifts on its own. It does not make them identical:
batching and expert routing move on the far end regardless.

## Strategy

Two requests. **The first** carries the resized image and `PROMPT_ONE`: reasoning
about the picture at whatever length it takes — the pose, the clothing, what is
bare, the direction the body and gaze face — and then one answer outright,
`BREAST SIZE`, because a magnitude is not in anybody's prose account of a
picture.

**The second** carries `PROMPT_TWO` with that reasoning substituted into it, and
no picture. It asks for three things in this order:

1. **Reasoning** over the description it was given, field by field.
2. **Marked answers**, one per line. `BREAST SIZE` it copies through as written,
   Unknown included; the rest it works out from the clothing and pose the first
   call described — hair, gaze, setting, body shape, what is exposed, nakedness,
   bra, panties, topless, and how visible the nipples and genitals are.
3. **A caption** — one sentence condensed from all of it.

Three choices in that shape are deliberate. The picture reaches a model once, so
what the second call can answer is bounded by what the first wrote down — a
wrong caption is then attributable to the looking or to the reading of it, which
one call cannot separate. Within the second call the model writes its reasoning
out before it concludes anything, because a conclusion asked for on its own is
one guessed from overall impression rather than read off what it has. And the
marked answers come after that reasoning rather than before it, for the same
reason: bare-versus-covered is the discrimination being measured, so the answer
has to follow the looking.

**Only breast size is answered by the call with eyes.** It is a magnitude, and
prose about a picture doesn't carry one, so the second call was inventing it —
and an invention from a prior lands on whichever grade the rubric describes as
ordinary. Everything else follows from the clothing and pose the first call
writes down, which text does carry, so everything else stayed where it was and
is the control for the change.

## What is stored

Both prompts as sent, separated by `=== 2 ===` — so the file carries the first
call's reply, which is where it went; the second reply, verbatim; and every
field [`fields.ts`](../../fields.ts) asks about, read off the reply's marked
lines.

Each line is `NAME: <answer>`. A **choice** field's line is read from the front
against a word list, because the model reliably justifies itself afterwards —
`NAKED: No — she is wearing a bralette and thong` answers `No`. A **text**
field's line is kept as written. What each word stores is set out in this
experiment rather than read from `fields.ts`: the version is a hash of this
directory alone, so a value recorded here has to live here, or a change
elsewhere would alter what this produces without moving its version.

Two of the fields aren't marked lines. The **caption** is the `CAPTION:` line,
and the **description** is everything above the first choice answer — the prose
the model wrote about the picture, headings like `REASONING:` dropped off the
front. Those two are also the sidecar, built from the fields rather than read
separately, so what a pack plays and what the caption is scored against are the
same text.

Every field takes the last line it can read, so a model that echoes the format
template first loses and one that trails an unreadable line after a good answer
does not. A field with no readable line is absent rather than guessed — an
absent answer is recoverable, a fabricated one is not. A reply carrying no
caption, or a caption with no prose behind it, is refused outright: an item with
fields and no description of what they were read from is worse than one that has
to be run again.

## What it is known to get wrong

Carried on purpose. A baseline quietly improved measures nothing.

- **The prompt assumes one female subject.** A second person, a man, and
  anything happening between people have nowhere to go in the checklist, so they
  are described as though absent.
- **Bare breasts are reported where they are covered**, and nipples are reported
  through fabric where there are none.
- **Sitting is confused with kneeling**, despite the checklist spelling out how
  to tell them apart.
- **Body orientation follows the gaze**: a subject kneeling away from the camera
  and looking back over her shoulder is described as facing the camera.
- **Breast size reads Medium whatever the picture holds.** Measured over the few
  items labelled and answered both ways, it gave the same grade every
  time. Asking the call with eyes for it, against what is on screen rather than
  a cup size, is the change under test; whether it moved is a question for a
  sweep, not for reading the prompt.

## Running it

Needs `OPENROUTER_API_KEY`. macOS only — the downscale shells out to `sips`.
