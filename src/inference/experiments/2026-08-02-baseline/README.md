# 2026-08-02-baseline

As with all experiments, nothing in here might make it into the core.

An outline of what is being investigated, not a specification or a plan.

## The problem

Two main issues with companion use of media.

### describe-image.ts prompt

It doesn't reliably determine:

- Sitting vs kneeling down vs kneeling up.
- Topless vs bare breasts. They are not the same, but describe-image.ts does not
  distinguish them, and a breast shape under clothes is commonly answered as
  bare breasts.
- Nipples visible vs seen through sheer fabric vs pokies, it often "sees" them
  when they aren't there. It never misses them if they are.
- If a subject's body is facing away from you, but they are looking at the
  camera, it often says they are facing the camera but describes the image as
  the whole body is facing you.

Most other things (hair, clothing, other items in the photos) are detected well.

Additionally, the prompt is written to assume a single, female subject.

### search_media returns poor results

search_media does keyword matching on a media item's sidecar naively: we match
each word in a search phrase given by a companion against each media item's
caption and description, and score any matches.

But describe-image.ts is not written to produce descriptions or captions
suitable for keyword search.

## Goals

This is the first experiment so the main goal is to work out a workflow for how
improving inference might work. We'll try these things as part of this:

- Start manually labelling source media
- To describe the pose more accurately
- To fix the topless/bare breasts distinction
- Determine breast size
- Deal with multi-subject and multi-gender media better
- Improve detection of body pose.
- Investigate whether storing the detected features in structured data helps
  with manually tagging/scoring inference to objectively measure improvements,
  and to help with an improved search_media algorithm.

## The approach

Use a vision model to reason about the media content and pass all of that
reasoning to a second text model which would summarise the contents of the media
item into a fixed set of observations and categories.

The result would be instead of free text search, there are fixed values for
things we're interested in:

- Genital visibility: just visible, not visible and unknown
- Breast size: small, medium, large, extra large and unknown.
- (See prompt.ts in experiment for a full list.)

A companion that knew the label set could pass these parameters as an object and
search on them directly, rather than by keyword.

Some fields like clothing, hair, gaze, would remain text searches.

## What we've tried and removed

Nothing.

## What we're trying now

- Two calls instead of one model doing everything.
- Prompt wording, repeatedly.
- Storing categorised values against a structured, fixed set of labels.
- Letting a sidecar's frontmatter carry any field. It used to refuse unknown
  keys, which caught a mistyped `capton:`; it now keeps whatever was written, so
  an experiment can record a new field without changing the pack format.
- Stripping a null answer ("none") in code before it is stored in a text field,
  instead of asking the prompt not to produce one.
- Finding text in the image and storing it as a field, with the aim that it
  might help the companion find more pictures of the same person (watermarks,
  text on clothing etc.)
- Scoring the detected text in media_search. Not done yet — the text is stored
  on the item and nothing searches it.
- Folding words that mean the same thing together in media_search, so "boobs"
  and "breasts" score as one word.
- Sampling among the items a query scores equally in media_search. A broad
  request scores most of a set alike — 161 of 164 described items, for "petite
  woman in tight clothes showing breasts" — and the tie used to break on the
  ref, so the same oldest two dozen filled every result.

## What is working

- Topless vs bare breasts is largely better
- Nipple visibility is noticeably better.
- Text detection is very reliable.

## What isn't working

- It's very hard to get breast size to report as anything but medium, even with
  considerable attempts at prompting - it regularly reports clearly small or
  large breasts as medium.
- Having single labels for "Breast size", "Genital visibility: yes/no" doesn't
  capture multiple subjects.

## What we've not tried

- Fully labelling a large corpus of images manually, and running structured
  tests following prompt changes. We change something, then check a small number
  of images manually. This is fine while we're working out the experiment
  workflow.
- We've not prompted any companions to try and pass detected text back to a
  search to see if they can find similar pictures.
- Using embeddings/vector search for searching (Futuregazing?)

## Futuregazing

Things not necessarily for this experiment, but thoughts which fall out of our
experimenting.

- Should inference normalise the words when it writes the sidecar, or
  media_search when it searches? Normalising in inference would need the
  companion to search in a specific way, which mediaSummary might help with.
  Perhaps we need both.
- An experiment can't change how search works without changing core code. A
  media_search per experiment would fix that; without one, trying embeddings or
  vector search means touching a lot of core just to try it. Both search changes
  this experiment has wanted so far — folding synonyms, and sampling among equal
  scores — landed in core for that reason, and now apply to every pack whether
  or not its captions came from an experiment.
- We have a fixed set of labels in the inference interface, which other pack
  creators can't add to. Labels should be extensible. Solved by embeddings.
