# Inference library — describing a library, and finding one picture in it

What it takes for a companion to have a large picture library and use it well:

- They know roughly what they've got.
- You can ask them for something and they find it.
- They can climb from clothed to explicit over a session.

[goonpacks](../GOONPACKS.md) is the shipped pack format, a curated zip you can
hand to someone today. This file is what happens when the set is far too big to
curate. All of it operates on the **user's own images, on their own machine** —
see the [content policy](../DEVELOPERS.md#content-policy).

The plumbing this needs has shipped: what a pack stores per item and about its
set, and the two tools a companion calls. [GOONPACKS.md](../GOONPACKS.md)
documents the format. What's left here is everything that plumbing deliberately
doesn't decide:

- What goes in a description.
- Which model writes it.
- How the search ranks.
- What the summary says.
- Reviewing the output at scale.
- Where a library too big to package lives.

None of it can be measured without a library big enough to tell one answer from
another, because a better caption only shows up as a better search result.

## Two jobs — don't conflate them

Almost every wrong turn here comes from trying to do both of these with one
mechanism:

- **Knowing what the set is like.** Small, always in their context, so they
  reach for plausible things and don't offer what isn't there. This is a
  **summary**.
- **Finding one specific item.** On demand, over thousands, and it has no
  business being in their context at all. This is **retrieval**.

Both ship, separately: the summary rides their prompt, and `search_media` does
the retrieval. One list of every item, picked by number, works at fifty and
fails well before a thousand, not because the window fills but because a model
choosing between two thousand near-identical descriptions chooses badly.

## Two regimes — hand-reviewable, or not

The line that matters isn't a number of images, it's whether a human will ever
read the output. Past a few hundred, reading every caption stops being something
anyone would do, and that changes what the pipeline is _for_:

- **Hand-reviewable (up to a few hundred).** Human-in-the-loop is the workflow,
  not a fallback: use the best, most compliant model, crank the resolution,
  don't optimise, and fix the few captions the model flubs. Model accuracy is a
  convenience.
- **Not hand-reviewable (anything above).** The pipeline's output _is_ the
  truth, because nobody will ever read most of it. Accuracy has to come from the
  model and the prompt, review becomes sampling plus tooling, and every quality
  question below starts to matter.

A curated persona set is hand-reviewable. A collected set of a couple of
thousand is not, so captioning quality starts to matter well before a library
reaches any impressive size.

## How a request gets served

**They ask, in words, and the app does the searching.** In order:

1. **Offline.** Every item gets two texts: a long description of everything in
   the picture, and a one-line caption condensed from it. (This is how
   `scripts/describe-image.ts` works — it observes at length and then
   condenses.)
2. **Offline.** An LLM reads the captions and descriptions and writes the set
   summary.
3. **Session start.** Their prompt carries the summary and nothing else about
   the media.
4. **Mid-conversation.** They call `search_media` with a description of what
   they want — "me on my knees looking up at him" — and get back a bounded set
   of matches, each a ref, its kind and its caption.
5. **They send by ref.** `send_media` takes one of those refs, so the sends
   after a search cost no inference at all, and they have read the caption of
   what they chose before it lands. The send hands back the description as well
   — a caption is enough to choose between twenty-five, and not enough to talk
   about the one now on his screen.
6. **No match is an answer.** When nothing is close the search says so, and they
   ask for something else — far better than them announcing a picture that never
   came.

Why it is app code and not theirs:

- Searching means reading the corpus, and the corpus is exactly what doesn't
  fit.
- Their job is character, not lookup.
- In the app it can use methods a chat turn can't, and be improved without
  touching anybody's persona prompt.

The corpus therefore never enters their context. A bounded working set does,
small and riding as append-only tool results, so the prefix cache is unaffected.

### Coarse on captions, fine on the long descriptions

Two texts, two passes:

- **Coarse, over the captions.** Embedding search gets _worse_ on long text: a
  vector over two hundred words is an average of everything in them, so it
  matches many things weakly and nothing strongly. A short caption is the
  searchable projection.
- **Fine, over the long descriptions.** Hand a cheap LLM the request plus the
  full descriptions of only the coarse pass's candidates and let it choose.
  Detail the caption dropped is unfindable in the coarse pass and present here,
  which is what answers "is there a mirror in it", "does he have a condom on",
  "is he behind her".

Both halves are candidates rather than decisions. The methods worth comparing:

- the lexical overlap that ships (`src/lib/companions/media-search.ts`);
- a cheap LLM reading all the captions;
- caption-embedding top-k;
- top-k plus the rerank;
- the same with an image embedding added.

Score them by hand against thirty to fifty requests in a companion's own words
("something with a man in it", "topless but not explicit", "filthier than the
last one"). The output is the least that works and where it breaks. Start with
the coarse pass alone and earn the rest.

### Filters are structured, not semantic

Hard constraints must not be left to similarity. A companion who never sends
nudes must be _unable_ to; "with a man in it" is a filter, not a vibe; person
identity is a filter. So each item also carries a structured attribute panel
(**What we store per item**) and the search applies those as filters before it
ranks anything.

### The search is thread-scoped

Stateless search sends the same best match all evening. It needs:

- **What they've already sent**, as an exclusion set, plus near-duplicate
  collapse so the second-best isn't the same shot from an inch to the left. The
  exclusion set is what ships. It is rebuilt from the thread, which is never
  trimmed, so it spans every conversation with that companion rather than one
  evening.
- **The last item and the current heat band**, because that's what makes
  relative requests work — and "something filthier than that" is how escalation
  is actually spoken.

The sharper version of the same problem: a search returning the top N over a set
holding hundreds of similar items returns the same N every time. The levers,
none of them chosen:

- Exclusion of what's been sent.
- Near-duplicate collapse.
- A cursor that continues past the last search.
- Sampling from everything above a threshold rather than strict top-N. Items a
  query scores equally are already sampled; the threshold is what isn't built.

Sampling above a threshold is also what "something at random" needs, so it may
serve the query-less request too. Which one earns its place is a question for a
real library; what the tool must not do is foreclose them.

How many a search returns is the other half, and it can be answered without
picking a lever. `SEARCH_LIMIT` is an arbitrary starting point. Too few and a
topic runs dry after a couple of sends; too many and every search costs a page
of context for the rest of the conversation. A number falls out of running real
requests against a real set and counting how far down the list anything gets
sent from.

Exhaustion is in [BUG.md](../BUG.md) → Companions.

### One interface, several implementations

They always ask by description; what's underneath scales with the set. At fifty
items "retrieval" is a cheap model reading all the captions. At thousands it's
embeddings plus a rerank. At tens of thousands it's the same with attribute
prefiltering doing more of the work. The tool contract never changes, so none of
this is visible to a persona — which is what lets the first implementation exist
to make the tools work end to end rather than to be good.

## What we store per item

- **The long description** — everything in the picture, in prose. The retrieval
  fine pass and any future re-derivation both read this, so it's worth having
  even though nothing shows it to a user.
- **The caption** — one line, the coarse-pass index and the text they're handed
  when something sends.
- **A structured attribute panel** —
  `{nudity, people, acts, garments, person, …}` as scored or enumerated fields,
  for filters and for the summary's counts.
- **A caption embedding**, and ideally an **image embedding** too: the caption
  is a lossy projection, and the image vector catches what the captioner never
  wrote down.
- **Text found in the image** — a watermark or overlay is often the cheapest
  "more of this person" signal there is, and a free seed for person identity.
- **A dedup hash / near-duplicate cluster id.**

Where these live is settled: a `.md` sidecar per item, caption in frontmatter
and long description as the body, with the later fields joining the frontmatter.
Embeddings are the exception — they never go in a text file.

## The set summary

Generated by an LLM over the captions and descriptions, not hand-written.
Authored prose goes stale and is then wrong, which is worse than absent. An
author overriding it is fine; the default should be derived and regenerated
whenever the set changes. Where it lives and when a pack must have one are in
[GOONPACKS.md](../GOONPACKS.md).

It has two jobs:

- **So they don't offer what isn't there.** Proportions, who's in it, which acts
  appear, the settings, the range of undress.
- **So they phrase a request in words the corpus actually uses.** This is what
  makes the search work. A request built from vocabulary the captions don't
  contain matches nothing, however good the retrieval is.

That makes it partly an inventory of terms: the hair colours, garments,
settings, acts and names present in the set. Its length follows the set rather
than a target. The line to hold is **enumerate the vocabulary, not the items**.
A companion should be able to tell what kind of request is answerable without
being handed a catalogue to choose from.

**Neutral or persona-aware?** Unsettled. A neutral summary is derived once per
set and cached. Different personas care about different dimensions of the same
facts — one needs to know how explicit the set gets, another how often a man
appears. A summary complete over the dimensions serves both and stays cacheable,
with the persona's own prompt supplying the attitude to it. Generating it per
persona is the alternative: more pointed, much less reusable. Worth testing
rather than assuming. It is per resolved pack-plus-overlay either way, since an
overlay changes the set.

## Producing the descriptions

### The yardstick comes first

A labelled set deliberately loaded with the hard cases (how big it has to be is
in [the inference UI spec](../docs/2026-08-02-inference-ui-spec.md) → Scale):

- Sheer versus opaque.
- Nipples through fabric.
- Topless versus covered.
- A cock in frame.
- Penetration.
- Oral.
- More than one person.
- Watermarks.
- Near duplicates.

Hand-write the ground truth once.

Nothing else under **Producing the descriptions** should start without it —
every comparison here is otherwise an impression rather than a number, which is
how the current prompt came to be confidently wrong in a few places. What writes
and scores it has shipped: [INFERENCE.md](../INFERENCE.md) is the corpus, the
ground truth and one directory of code per experiment.

### What a description should contain

The prompt is written around one woman alone in a pose, so a second body, a man,
and anything happening _between_ people have nowhere to go. That's a schema gap
rather than an accuracy one, and no model fixes it. The shape to try:
**establish the scene first** — how many people, which sexes, what is happening
between them — **then each person, then any text in the image.**

Two specific errors to chase against the yardstick while here. Bare breasts
called covered and covered called bare, which is a discrimination the prompt
already asks for outright. And nipples through fabric missed, where the suspect
is that prompt's own anti-false-positive wording over-correcting into false
negatives — a one-line change with a measurable answer.

How the caption is condensed out of the description is the other half, and it is
cheap to iterate: with the long description stored, a new caption re-condenses
text already on disk, with no image and no vision model.

### Model, resolution, compliance

- **Backend is pluggable.** `describe-image.ts` reads `LLM_URL` and only
  defaults to OpenRouter, so a local OpenAI-compatible server (MLX + LM Studio)
  is a config change. Without hardware, a one-time cloud pass costs pennies per
  thousand.
- **Compliance is the real selection criterion**, not parameter count. Many VLMs
  soften or refuse explicit description. Test candidates on a handful of
  explicit images and keep whichever follows the prompt without moralising;
  abliterated community fine-tunes exist where a base model is coy.
- **You don't need a frontier model for this.** Captioning pose and undress
  isn't hard reasoning. Mid-size open VLMs (Qwen-VL, InternVL, MiniCPM-V, Gemma)
  are the sensible band, and smaller is a _feature_ at scale, where throughput
  decides whether a full pass is hours or days. The current default model and
  the alternatives worth trying are listed at the top of `describe-image.ts`.
- **Resolution before model.** The known failure — small models unable to tell
  sitting from kneeling — is mostly resolution: fine spatial detail is what gets
  destroyed when an image is down-sampled into fewer visual tokens, and it's a
  config change rather than a model swap.
- **Prompt is a smaller lever than it looks, and there is some left.** The two
  structural moves are already made — observe out loud before condensing, and
  state outright how to tell confusable cases apart. What's left is scope, which
  is **What a description should contain** rather than a model question.
- **Some ambiguity is irreducible.** A single frame sometimes can't say. Don't
  chase the last few percent.

### Specialists where a VLM is weak

- Explicit body parts → **NudeNet** (per-part exposure boxes, calibrated, ONNX).
- Face-specific traits (hair colour, "beautiful face", makeup) → a
  **CelebA-attribute model** on a face crop, which beats CLIP on faces.
- **CLIP / SigLIP zero-shot** for cheap continuous attributes: embed once, then
  every _new_ attribute is a text prompt scored against cached embeddings in
  seconds. Adding attributes is nearly free, forever, which is the whole
  argument for a panel over a single "heat" score.
- **Calibrate before comparing.** Raw cosine scores aren't comparable across
  prompts: softmax over mutually-exclusive alternatives (bikini / dress /
  clothed / nude) for probabilities, or rank within the library when an ordering
  is all you need. SigLIP's sigmoid makes per-prompt scores more independently
  meaningful, which is a reason to prefer it here.

An embedding is **not** a set of named attributes. It's a few hundred anonymous
learned numbers with no "bikini dimension" — meaning lives as _directions_
through the space, not axes. Named attributes are a derived layer you get by
projecting onto a text-prompt direction, or from a VLM.

### People, video, duplicates, batches

- **Person identity:** embed faces (InsightFace / ArcFace), cluster on cosine
  distance for identities without pre-specifying counts. Folders already sorted
  by person turn clustering into classification — build a centroid per known
  person, assign the rest to the nearest, and only cluster the remainder. "My
  type" then comes free: the combined centroid of everyone collected is a taste
  vector.
- **Short clips ride the same pipeline.** Keyframe them (scene change, or one a
  second or two), run the identical pass per frame, pool per clip — max-pool for
  "ever shows X", or keep per-frame so they can send the best frame or a loop.
  Long-form video is about action over time rather than static attributes and is
  a materially bigger build; when it comes, the unit is auto-cut clips, which
  collapses it back into this pipeline.
- **Dedup matters at scale.** Collected libraries are full of near-identical
  bursts. The embeddings you're computing anyway give near-duplicate collapse,
  which retrieval needs regardless.
- **Batch strategy:** small batches while the schema churns, then one full pass
  once it settles — bigger batches don't buy accuracy, the model is fixed, they
  only buy coverage. Stratify across folders so one huge folder doesn't
  dominate, and expect random sampling to under-represent rare classes.

## Reviewing the output

Where the set isn't hand-reviewable the output can't be read end to end, so
reviewing it has to be visual and targeted.

- **"Is each tag right?" → a sorted, faceted grid.** Sorted by heat you can
  _see_ the ramp, and a wrong jump is a wrong score spotted instantly.
  Per-attribute top-N / bottom-N rows QA each tag by eye.
- **"Is the structure right?" → the embedding map.** Project the embeddings to
  2D and plot every image as a thumbnail on a pan/zoom plane. The axes mean
  nothing; you read regions. Recolour the same map by heat, person or attribute
  — a real concept lights up a tidy patch, a meaningless tag scatters across the
  whole map. It QAs person clusters at a glance too (merged people are one blob,
  a split person is two).
- **"What do I even have?" → distributions.** A heat histogram (a smooth ramp,
  or bimodal with a hole where the build should be?), attribute prevalence, a
  co-occurrence heatmap, per-person counts. This is also the human-readable
  version of the set summary.
- **"Does the experience work?" → a storyboard.** Render the sequence a persona
  _would_ feed as a scrubbable filmstrip, drawn as a rising heat curve where
  each point is its thumbnail — the same visual language as the play modes'
  timeline.
- **Active QA → triage by swipe.** Show only the informative cases
  (near-threshold, rare tags, near-duplicate stacks collapsed) and thumb them.
  Doubles as label collection.

**Browsing as its own reward.** A folder tree only holds structure you imposed;
the embedding map surfaces structure that emerged — a "type" cluster you never
noticed, forgotten images sitting beside their near neighbours. "More like this"
is free, and so is a path between two images that morphs a clothed shot into a
nude of the same look, every step a real picture.

## Where it runs, and what it costs to store

Pack media already lives in OPFS, one directory tree per installed pack
(`src/lib/goonpacks/store.ts`), which is the hard part of this problem already
solved. What's new is the index, and it's the cheap part: embeddings and
attributes for tens of thousands of images are a few hundred megabytes at most
and search over them is in-memory top-k in milliseconds — no vector database.

The distribution split is built, in its first form:

- **Portable pack.** Self-contained, unpacked into browser storage, works on a
  hosted build. This is [goonpacks](../GOONPACKS.md) as shipped.
- **Local library.** The user's own directory under `goonpacks/`, served by
  their own dev server and fetched by URL, never distributed
  (`src/lib/goonpacks/disk-source.ts`).

So a companion is already either _packaged_ or _local-backed_, chosen by whether
you're running a public build or your own copy. What a big library adds is the
offline index, and a directory that need not sit under `goonpacks/`. Naming for
the eventual big-library format is unsettled; "supergoonpack" is a placeholder,
and it is where everything in this file lands rather than something to design up
front.

## Open questions

- **Whether the summary is neutral or persona-aware** (**The set summary**).
- **How long a long description should be**, which trades captioning cost and
  rerank cost against how much detail survives to be searched.
- **Whether the coarse pass needs the image embedding at all**, or captions
  alone carry it.
- **Where the heat band lives** — a companion's own sense of the session, or a
  number the app tracks and hands them.
- **Which diversity lever**, and how many results a search returns (**The search
  is thread-scoped**).
- **Whether hard constraints need the structured attribute filters** or fall out
  of ranking (**Filters are structured, not semantic**).
