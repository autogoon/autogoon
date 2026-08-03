# 2026-08-02-baseline

The first experiment: one vision model, one call per image, describing a single
subject in prose and then answering whether she is naked. It exists so that
everything after it has something to be measured against, so it changes only
where it is wrong about its own intent — a better idea belongs in a new
experiment, where it can be scored against this one.

## Model and parameters

|             |                                                                       |
| ----------- | --------------------------------------------------------------------- |
| Model       | `qwen/qwen3-vl-235b-a22b-instruct`                                    |
| Endpoint    | OpenRouter's chat completions API, or `LLM_URL` if set                |
| Temperature | 0                                                                     |
| Image       | downscaled to a long edge of 1024px, re-encoded as JPEG at quality 80 |

Temperature 0 makes two runs of this experiment comparable, so a re-run measures
how much a hosted model drifts on its own. It does not make them identical:
batching and expert routing move on the far end regardless.

## Strategy

A single request carrying the resized image and one prompt, which asks for three
things in this order:

1. **Observations** — a fixed checklist answered line by line: what the
   subject's weight rests on, where the knees and heels are, sitting versus
   kneeling versus squatting, which way the torso and head face, each garment
   and how it is arranged, which parts are bare and how plainly, whether fabric
   over the breasts is sheer or opaque, and whether nipples are visible.
2. **The naked flag** — `NAKED: true` if she is wearing nothing at all, `false`
   if she is wearing anything, however little. Topless is not naked.
3. **A caption** — one sentence of roughly 35–45 words condensed from the
   observations.

Two choices in that shape are deliberate. The model writes its observations out
before it concludes anything, because a conclusion asked for on its own is one
guessed from overall impression rather than read off the picture. And the naked
flag comes after the observations rather than before them, for the same reason:
bare-versus-covered is the discrimination being measured, so the answer has to
follow the looking.

## What is stored

The prompt as sent; the whole reply, verbatim; one field parsed from it:

    naked: true | false

and a sidecar — the `CAPTION:` line as the caption, the observations above it as
the description.

Both parsers take the last marked line, so a model that echoes the format
template first loses. A reply carrying no `NAKED:` line answers no field rather
than defaulting to `false` — an absent answer is recoverable, a fabricated one
is not. A reply carrying no caption, or a caption with no observations behind
it, is refused outright: an item with fields and no description of what they
were read from is worse than one that has to be run again.

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
- **Breast size is never reported.** Nothing asks for it.

## Running it

Needs `OPENROUTER_API_KEY`. macOS only — the downscale shells out to `sips`.
