# Inference library — image tagging & mood retrieval

How to auto-tag an image library so a companion/goon feature can pick pictures
by person and by "how sexy" — running locally where the hardware justifies it,
cloud where it doesn't. Also covers the **v2 library system** built on this
pipeline (mood retrieval, storage, two-tier architecture). Companion to
[goonpacks](../GOONPACKS.md) (the shipped, simpler persona-pack format). All of
this operates on the **user's own images, on their own machine** — see the
[content policy](../DEVELOPERS.md#content-policy).

## Two distinct jobs — don't conflate them

The scale changes everything, so keep these separate:

- **The persona picture set (~50, a few hundred absolute max).** The images that
  belong to one companion (e.g. Aimee), captioned so she can pick "a picture
  that fits the moment." This is the existing branch functionality.
- **The large mood-Goon library (say 40k images).** A big personal library, fed
  to the Goon play mode and picked by mood. This is where all the pipeline
  machinery below actually earns its keep.

At **50 images**, almost none of the scale discussion applies: cost is pennies
even on the biggest cloud model, throughput is irrelevant, and you can **read
all 50 captions and hand-correct the few the model flubs**. Use the best,
most-compliant model, crank resolution, don't optimise. Human-in-the-loop is the
correct workflow, not a fallback.

Everything below is really about the **40k** case unless noted.

## Scoring "sexiness" — it's a spectrum, and better still, a panel

Three tiers, and the winning move combines them:

- **Dedicated NSFW models** — literal "how naked." NudeNet (per-part exposure
  boxes → a coverage scalar; ONNX, trivial), or small ViT classifiers
  (`Falconsai/nsfw_image_detection`, `marqo/nsfw-image-detection-384`) for a
  continuous NSFW probability. Measures nudity, which correlates with but isn't
  identical to _sexy_.
- **CLIP / SigLIP zero-shot** — the recommended backbone. Embed each image once,
  then score against an ordered prompt ladder ("fully clothed" → "revealing" →
  "lingerie" → "nude" → "explicit"). Continuous, tunable, **no labelling**.
- **VLMs** — semantic 1–10 ratings via prompt. Most flexible to author, but slow
  (~1–3s/image) and often safety-tuned/prudish on explicit content. Best used to
  _auto-label a training set_, not to score all 40k.

### Prefer an attribute panel over a single scalar

You don't want one "sexy" number; you want a per-image panel:
`{bikini: 0.8, bareLegs: 0.9, tights: .., cleavage: .., nude: 0.1, blackHair: 0.95, beautifulFace: 0.7, ...}`.
Reasons:

- **Killer property of CLIP/SigLIP:** embed once, and every _new_ attribute is a
  text prompt scored in seconds against the cached embeddings — no re-embedding.
  Adding attributes is ~free, forever. Directly serves "the more
  classifications, the more flexibility."
- **"Progressively sexier" becomes a weighted formula** over the panel, tuned at
  query time (or by the persona live) — see the end-goal section below.
  Different mood = different weights, no re-tagging.

### Where CLIP is weak, drop in a specialist

- Explicit body parts (nude/breasts) → **NudeNet** (calibrated, boxes).
- Hair colour / "beautiful face" / makeup → a **CelebA-attribute face model** on
  the InsightFace face crop (face-specific traits beat CLIP).
- Precise garment/skin regions (legs, tights) → **human-parsing segmentation**
  (pixel regions) — optional; CLIP's "bare legs" prompt is usually fine.

### Calibration

Raw CLIP cosine scores aren't comparable across prompts. Fixes:

- **Softmax over alternatives** for mutually-exclusive concepts ("bikini" vs
  "dress" vs "clothed" vs "nude") → calibrated per-image probabilities.
- **Rank / percentile within the library** — sort by an attribute, top X% =
  present. Sidesteps thresholds; fine when you only need an ordering (the ramp).
- SigLIP's sigmoid makes per-prompt scores more independently meaningful — a
  reason to lean SigLIP over CLIP here.

## What embeddings actually are (foundational)

An embedding is **not** a set of named attributes. It's ~512–768 anonymous,
learned numbers; no single dimension is "the bikini dimension." Meaning is
**distributed** and lives as **directions** through the space, not individual
axes — like how "sunset colours" is a region of RGB space, not one channel. The
whole vector captures the image's gestalt (pose, clothing, colour, framing,
vibe). Named attributes (bikini, nude) are a _separate derived layer_ you
compute by projecting onto a text-prompt direction, or via a VLM. This underpins
the embedding-map visualisation below.

## Person identification

- **Embed faces** with InsightFace / ArcFace (512-d per face; ONNX, fast).
- **Cluster** with HDBSCAN/DBSCAN on cosine distance → identities without
  pre-specifying counts.
- **Sorted folders flip clustering → classification.** If the library already
  has folders sorted by person, those are ground-truth: build a **centroid per
  known person**, assign unsorted faces to the **nearest centroid** (far more
  reliable than clustering from scratch), and only cluster the "nobody I know"
  remainder.
- **"My type" is nearly free:** the combined centroid of the people a user has
  collected is a taste vector — rank everyone by distance to it.

## Video

- **Short clips → same pipeline, ~free.** Extract keyframes (scene-change or 1
  frame/1–2s), run the identical attribute pass per frame, pool to a per-clip
  vector (max-pool for "ever shows X", or keep per-frame so she can send the
  hottest frame / a short loop). 20s clip @ 1fps ≈ 20 images. Drops into the
  same index with `{sourceVideo, timestamp}`.
- **Long-form video → defer it.** It's about _actions over time_, not static
  attributes, and the session never watches a whole one. Materially bigger build
  (temporal/shot segmentation, action tagging) for lower payoff. When tackled,
  the unit is **auto-cut clips** treated like short ones — so it collapses back
  into the clip pipeline; only the clip-mining front-end is extra.

## Sampling & batch strategy (40k)

- **Random ~1–10k is fine for iterating the schema and throughput**, but random
  **under-samples rare classes**. Given free overnight local compute, **go big
  and skip manual curation** — let volume surface the niches, then **filter the
  run's own output** for low-frequency / mid-confidence tags and eyeball those.
  The output is the review tool.
- **Stratify across folders** so one huge folder doesn't dominate. Iterate the
  attribute schema on the folders the app will actually feed from; keep
  person-sorted folders separate as identity seeds.
- **Bigger batches don't improve accuracy** — the model is fixed. Scale only
  buys coverage + more usable data. So: small batch while the schema churns
  (fast reruns), **full library once the schema settles** (40k @ ~2s ≈ ~one
  unattended day).
- **Dedup matters at this scale.** Big libraries are full of near-identical
  bursts and variants. Compute the CLIP embedding alongside whatever tagger you
  use — it gives near-duplicate collapse (so she won't send five near-identical
  shots), plus free future text-search and "my type" search.

## Inference backend & local-hardware reality

- **Backend is pluggable.** The `describe-image` script already reads `LLM_URL`
  and only defaults to OpenRouter — point it at a local OpenAI-compatible server
  (MLX + LM Studio) and nothing else changes. People without hardware pay
  OpenRouter pennies for a one-time pass; a capable local machine runs it free.
- **You don't want a 235B for this anyway.** Captioning pose/undress is not a
  hard reasoning task. In 64GB of RAM, **Qwen2.5-VL 7B/32B** (7B ~8–16GB, 32B
  ~20GB 4-bit) is plenty; 72B fits at ~40GB but is the tight, slow ceiling.
  Alternatives: InternVL (8B/26B/38B), MiniCPM-V (~8B), Gemma 3 (12B/27B). The
  huge MoE models (235B Qwen, the big MiniMax ones) are cloud-only — a
  non-issue, since you'd pick smaller regardless.
- **Smaller is a _feature_ at 40k** — throughput dominates (a 7B is ~1s/image vs
  several for a 72B; hours vs a day+).
- **Compliance is the real selection criterion**, not parameter count. Many VLMs
  soften or refuse explicit description. Qwen tends compliant; test 2–3
  candidates on a handful of explicit images and keep whichever follows the
  prompt without moralising. Uncensored/abliterated community fine-tunes exist
  if the base is coy.

## Model quality — the sitting-vs-kneeling failure

Small VLMs failed to tell sitting from kneeling. That's **diagnostic, and mostly
a model/resolution issue, not a prompt one**: fine-grained _spatial/relational_
reasoning is exactly what scales with size, while general caption fluency fakes
quality convincingly. The distinction hinges on leg geometry that gets blurred
when a small model down-samples into fewer visual tokens.

Levers, in order of impact:

1. **Resolution / tiling** (a config, not a model swap) — often the biggest jump
   for pose; feeds the model the leg detail it was missing.
2. **Model** — Qwen2.5-VL (native-res ViT) and InternVL (tiling) are the best
   small ones for grounded spatial detail; worth one comparison round.
3. **Prompt** — limited, and largely spent: the two moves it had to offer are
   already made in `scripts/describe-image.mjs`, which has the model observe the
   picture out loud before condensing to the caption, and states outright _how_
   to tell the confusable poses apart. If the pixels aren't there, no prompt
   fixes it.
4. **Irreducible ambiguity** — a single frame sometimes genuinely can't say.
   Don't chase 100%.

Bottom line: at 40k, resolution + model matter and a big cloud model at
"thousands of images per dollar" is a rational one-time spend. At 50 (Aimee),
just use the best model and hand-fix the odd caption.

## Visualising & reviewing the output

"JSON + jq + opening images" throws away the two things that make this
visualisable: images are spatial, and the tags give you structure to arrange by.
Different views answer different questions:

- **"Is each tag right?" → sorted, faceted grid.** A grid **sorted by heat**
  lets you _see the ramp_ (clothed top-left → explicit bottom-right); a wrong
  jump is a wrong score, spotted instantly. Per-attribute **top-N/bottom-N
  rows** QA each tag by eye.
- **"Is the structure right?" → the embedding map.** Project the CLIP/face
  embeddings to 2D (UMAP/t-SNE), plot each image as a tiny thumbnail on a
  pan/zoom plane (à la PixPlot). Similar images cluster → the library becomes a
  _landscape_ you wander. **The axes mean nothing** (all dims squashed to 2 to
  preserve nearness); you read _regions_. **Recolour** the same map by heat,
  person, or an attribute — if "tights" lights up a tidy patch it's a real
  concept; if it's confetti, the tag is meaningless. Also QAs person clusters
  (merged people = one blob; split person = two).
- **"What do I even have?" → distributions.** Heat **histogram** (smooth ramp,
  or bimodal with a hole where the _build_ should be?); attribute **prevalence**
  (which moods are feasible); attribute **co-occurrence heatmap** (the structure
  of your taste); **per-person counts** (who can sustain a session).
- **"Does the experience work?" → storyboard.** Render the sequence the persona
  _would_ feed, as a scrubbable horizontal filmstrip. Ties to the existing
  **Sparkline/timeline** UI — draw the picture ramp as a rising heat curve where
  each point _is_ its thumbnail, matching Goon/Groove's visual language.
- **Active QA → triage-by-swipe.** Show the _informative_ cases (near-threshold,
  rare tags, near-dup stacks collapsed) and thumbs them; doubles as label
  collection for the optional probe.

**Browsing-as-interest.** A folder tree only holds structure you already
imposed; the embedding map surfaces structure that _emerges_ — a "type" cluster
you never noticed, forgotten images next to their cousins. Little toys come
almost free: "more like this" (radiate by similarity), a coherent _walk_ through
the space, or a **path between two images** that morphs a clothed shot into a
nude of the same look, every step a real image — a ramp you steer by picking
endpoints. The library stops being a filing cabinet and becomes a place you get
lost in.

## Labelling — needed only for the optional probe

- **Zero-shot needs no labels** — you write ~5 prompts, not 40k labels.
- **Linear probe** (embed once → hand-label a few hundred on your 0–5 scale →
  train a Ridge/logistic head in seconds → predict on all) personalises the axis
  to _your_ taste. It's the _only_ part that needs labels, and it's an **upgrade
  you reach for after** seeing zero-shot's output, not upfront. Reuses the same
  embeddings — no heavy rework.

## The end goal — the inference-driven library ("supergoonpack")

This is the eventual _shippable_ shape of the whole inference project, **not** a
near-term format. Everything above — the tagging, embeddings, person-ID, dedup,
sampling, and review — is the substantial body of work that has to happen first;
the "supergoonpack" is only where it eventually lands. Where a
[goonpack](../GOONPACKS.md) is a small curated zip you can ship today, this is
the big inference-powered library: tens of thousands of images, tagged by the
pipeline above, picked by _mood_. (No settled name yet — "supergoonpack" is the
placeholder.)

### Persona-driven picture feed

You don't pre-declare a mood; you **converse, and she reads the room.** The
persona is already an LLM agent with tools (`send_media` exists) — so the tagged
library becomes something she **searches from the conversation**, filtering by
person, by the attributes you're after, and by a "heat" band she raises over the
session (like a play mode owns its ramp), steered live: "more legs" → bias the
legs/tights attributes; "her again" / "someone new" → filter by person; "softer"
/ "not yet" → drop the heat back down; silence / building → keep climbing.

**Two ways her request could get matched** (flagged, not settled): _fixed
attribute fields_ — filter/sort on the pre-computed panel, no runtime ML — vs
_live CLIP text search_ — match a free-text request against stored image
embeddings; open-ended, but needs the CLIP text encoder at runtime. Retrieval is
cheap in-memory (40k × ~768 floats ≈ 120MB, top-k in ms) — no vector DB.

### Storage — embeddings tiny, pixels costly

- **localStorage** (~5MB, strings) — manifest / thread only.
- **IndexedDB** — the home for image blobs; quota is a fraction of free disk
  (GBs), call `navigator.storage.persist()` to avoid eviction.
- **OPFS** — newer, faster, file-like; larger blobs, later.

Key insight: you can hold the _index/embeddings_ for a whole 40k library in the
browser without blinking — it's the **JPEGs** that blow the budget (and
unzipping GBs in a tab is grim).

### Two-tier: portable vs local

- **Portable goonpack (browser / IndexedDB).** Small, self-contained, runs on a
  _hosted public_ build. This is the shipped [goonpacks](../GOONPACKS.md)
  format.
- **Local library (server-backed).** The user's own library folder served by the
  app's **own local Next server** (`npm run dev`) from a configured directory,
  indexed by the offline tagger, images fetched by URL, **never distributed**,
  on _their own machine_.

A persona is therefore either **"packaged"** (portable) or **"local-backed"**
(points at your folder) — same system, two backends, decided only by public
build vs your own local copy. This mirrors the scope split at the top: the
~50-image curated persona _is_ the portable goonpack; the big local library _is_
the inference-driven v2.
