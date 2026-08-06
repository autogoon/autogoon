# Describing images — observed inaccuracies

What [`scripts/describe-image.ts`](../scripts/describe-image.ts) gets wrong,
observed against real images.

[roadmap/INFERENCE-LIBRARY.md](../roadmap/INFERENCE-LIBRARY.md) carries the
ideas for what to do about these —
[Producing the descriptions](../roadmap/INFERENCE-LIBRARY.md#producing-the-descriptions)
for the inaccuracies,
[People, video, duplicates, batches](../roadmap/INFERENCE-LIBRARY.md#people-video-duplicates-batches)
for the clips.

The failures under [What it gets wrong](#what-it-gets-wrong) are in the model's
observations — the sidecar's `description`. The caption condensed from them is
[What the caption loses](#what-the-caption-loses).

## What it gets wrong

- **Breasts reported bare when they are covered.**
- **Nipples reported visible through fabric when they are not.**
- **Body orientation.** Someone kneeling with their back to the camera, head
  turned to look over their shoulder, is reported as facing the camera. Whether
  "facing" is the torso or the head is partly a question of semantics.
- **Sitting confused with kneeling.**
- **More than one person in frame.** `PROMPT` is written for a single female
  subject, so nothing in it can report a second person, or anyone's sex.

## What it never reports

- **Breast size.** Nothing in `PROMPT` asks for it. The baseline experiment does
  — `breastSize` in [`fields.ts`](../src/inference/fields.ts) — and
  [its README](../src/inference/experiments/2026-08-02-baseline/README.md)
  records how that went.

## What the caption loses

- Detail present in the long description does not always reach the caption.

## Video

- A video clip gets no sidecar from anything that writes one.
  `describe-image.ts` refuses anything `MEDIA_TYPES` does not list as an image,
  so a clip's caption and description are written by hand.

## What produced these

- `describe-image.ts` as it stood on 2026-08-02: its `PROMPT`, and
  `qwen/qwen3-vl-235b-a22b-instruct`, its default model then.
- Images downscaled to a long edge of `MAX_EDGE` before sending.

## Measuring a fix

[The inference UI spec](./2026-08-02-inference-ui-spec.md) is what was built to
answer these, and [INFERENCE.md](../INFERENCE.md) is what it became. The method
is what that spec serves and doesn't itself decide.

**Scoring.** Choice fields compare directly against the ground truth. Text
fields — the clothing, the setting — will never match word for word and need an
LLM to rate similarity. The comparison is paired, the same images under two
experiments, so what counts is which items flipped rather than the two rates.
Hosted models are not deterministic even at `temperature: 0`, so re-running one
process unchanged measures the noise floor.

**Corpus size.** How big the labelled set has to be is in
[the inference UI spec](./2026-08-02-inference-ui-spec.md) → Scale. The errors
are false positives, so plainly-negative cases matter as much as positive ones.
Every field in [`fields.ts`](../src/inference/fields.ts) has to be labelled — a
diff between two runs flags anything that moved.

**Caption and summary are their own steps.** Condensing a description into a
caption, and summarising a set into `mediaSummary`, each need their own scoring.
Search may read structured data rather than a caption at all. (Both now run per
experiment — [INFERENCE.md](../INFERENCE.md) → Playing what an experiment
described. Neither is scored.)

**Open: customising the inference per companion.** Whether a pack author can
tailor how their media is described, and how, is likelier to fall out of an
implementation than to be designed first.
