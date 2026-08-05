# Check questions

Open questions raised by the whole-repo `/doc-check` + `/style-check` pass, held
for review together at the end. Each entry carries the evidence, the options and
the resulting text, so it can be decided without re-reading the source.

This is a working file for that review. Delete it once the questions are
settled; it is not part of the documentation set.

## 1. The privacy claim is false — the app ships Vercel Analytics

**The problem.** Three places claim only device-control traffic leaves the
machine. The app sends page-view and Web-Vitals beacons to Vercel as well.

**The evidence.** `src/app/layout.tsx:3-4` imports `Analytics` from
`@vercel/analytics/next` and `SpeedInsights` from `@vercel/speed-insights/next`;
`layout.tsx:24-25` mounts both in the root layout, so they run on every screen
of every build. Both are production dependencies (`package.json:27-28`). No doc
in the repo mentions either.

The three claims:

- README.md — "**Private by default** — speech recognition runs entirely on your
  machine; only device-control traffic leaves it."
- README.md — "Everything runs in your browser; the only thing that leaves your
  machine is the control traffic to Autoblow's cloud API for the device itself."
- `src/components/home-panel.tsx:161-165`, on screen — "For the built-in play
  modes, speech recognition runs entirely on your machine — only the device
  control traffic leaves it."

**The options.**

- **Drop the two components.** Every claim stands as written, and the hosted app
  loses page-view and performance data. One edit to `layout.tsx`, two
  dependencies removed.
- **Amend the copy.** Keeps the measurements; three passages change, one of them
  in-app copy rather than a doc.

**The resulting text**, if the copy is amended:

    - **Private by default** — speech recognition runs entirely on your machine; no
      audio and no transcript ever leaves it.

    Everything runs in your browser. Two things leave your machine: the control
    traffic to Autoblow's cloud API for the device itself, and — on the hosted app —
    Vercel's page-view and performance measurements.

`home-panel.tsx` would need the same qualification.

## 2. The cumming wind-down doesn't rest — it crawls for half an hour

**The problem.** Goon and Groove both describe the wind-down as gliding to a
standstill and then resting. The device holds a raw speed of 5 for thirty
minutes first. This may be a defect rather than a documentation error.

**The evidence.** `goon-engine.ts:257-277` ramps `CUMMING_START_SPEED = 30` down
to `CUMMING_END_SPEED = 5`, then pushes the speed-0 event at `at + PARK_HOLD_MS`
where `PARK_HOLD_MS = 1_800_000` (`goon-engine.ts:102`).
`groove-engine.ts:266-288` does the same with the literal `1_800_000`. Every
event is `unscaled`, so Intensity cannot reduce it. The last ramp step lands at
about 9 s (Goon, `CUMMING_STEP_MS = 400`) and about 11 s (Groove, 500).

Both engine comments share the imprecision — `goon-engine.ts:251-256` says "a
slow, deliberate glide down to a standstill" and "leaves the device at rest".

Current text, modes/GOON.md:

    - **Wind-down** — the device eases off in a slow, deliberate glide from a
      moderate pace down to a standstill over about ten seconds, the strokes
      shortening as it goes, then rests.

modes/GROOVE.md → Cumming makes the same claim: "the device eases down in a slow
glide from a moderate pace to a standstill over about ten seconds".

**The options.**

- **The behaviour is intended** — the crawl is the rest, and a speed-0 event has
  to be parked somewhere. Then the two docs and both engine comments are wrong
  and get the text below.
- **The behaviour is a defect** — half an hour of movement after a send-off is
  not "rests", and the docs are right about the intent. Then it is a BUG.md
  entry and a `PARK_HOLD_MS` fix, and the docs stay.

**The resulting text**, if the behaviour stands (GOON.md):

    - **Wind-down** — the device eases off in a slow, deliberate glide from a
      moderate pace down to a crawl over about ten seconds, the strokes shortening
      as it goes, and stays there until it stops half an hour later.

## 3. The register, document-wide — decided; the counts say where

CLAUDE.md → Writing style names a recurring shape — a claim, a gloss on dashes
or a colon, then a consequence on `so…` or `which is…` — and the docs use it as
the default rather than where the reader needs it.

**The evidence.**

- ARCHITECTURE.md — ~188 sentences, 22 `so`-tails, 19 em-dash glosses, 6
  `X, not Y` contrasts (3 as bolded leads). Roughly every eighth sentence ends
  in a consequence clause.
- CLAUDE.md — 228 sentences, 73 with an em-dash gloss, 46 with a semicolon
  joining a consequence, 19 `, so …` tails; only 34% plain. The rule that names
  the shape breaks it on the next line.
- INFERENCE.md — 113 sentences, mean 23.3 words, 29 `, so …` tails, 35 em-dash
  glosses.
- DEVELOPERS.md — 64 sentences, and a second shape on top: 7
  definition-by-contrast constructions (`rather than` ×3, `, not …` ×4).
- CHANGELOG.md — 43 `, so…` / `, which…` tails across the 61 most recent
  entries. An entry reads as talk rather than a record.
- This file — 184 sentences, 3,747 words, 62 em-dashes, 16 `, so` tails, 7
  `, which` tails, 18 `rather than` contrasts. It is in the set like any other.

The pass breaks the tail off where it carries nothing, one document at a time,
across every `.md` file in the set.

## 4. CLAUDE.md states the gate set twice

**The problem.** CLAUDE.md → Documentation says "**One source of truth.** A
rule, list or procedure is stated in exactly one place and everywhere else
points at it." The gate set is stated in two places, and the two disagree on
when the gates run.

**The evidence.** Under Verifying changes:

    Before committing — or at the latest before a finished PR is reviewed — run
    `npm run typecheck`, `npm run lint`, and `npm run format`. If `format` changes
    files, commit those changes as part of the work; don't leave them or revert
    them.

Under Git workflow:

    - **Before opening a PR** (or marking a draft ready), the whole gate set passes:
      `npm run typecheck`, `lint` and `format` clean, `npm test` and
      `npm run test:e2e` both run (see Verifying changes for what each covers), …

One says "before committing", the other "before opening a PR". Git workflow
already points back at Verifying changes for what each command covers, so the
pointer direction is established.

**The proposed change.** Cut the trigger from Verifying changes, leaving it to
own what the commands are and Git workflow to own when they run.

**The resulting text** for the Verifying changes passage:

    When `format` changes files, commit those changes as part of the work; don't
    leave them or revert them. When the gates run is in Git workflow.

## 5. CLAUDE.md's "A way to think about it"

**The problem.** The triplet restates three definitions given in the list above
it, and two of its three bullets have no verb.

**The evidence.** CLAUDE.md → Documentation has already defined all three files
— "TODO.md — new features, additions and changes meant for soon", "BUG.md —
known defects in behaviour that is already implemented", "ROADMAP.md and
`roadmap/*.md` — longer-term features and direction". Then:

    A way to think about it:

    - ROADMAP.md says what could be, framed in how things are.
    - TODO.md how they should be.
    - BUG.md how they shouldn't be.

Style rules breached: "a sentence that loses nothing when deleted", "a phrase
restating the one before it", "none that only parses beside its neighbour".

**The options.** Delete the four lines, or keep them as a deliberate mnemonic.
They read as written on purpose. That is why this is a question and not a cut.

## 6. BUG.md — two entries in the braindump

Both change what the author recorded, so neither was applied.

**6a.** Sharpening the pack-removal entry into a specific symptom. Current:

    - Removing a pack from the Goonpacks list doesn't show that the pack has been
      removed, even when it has. Needs re-testing since disk packs landed.

Proposed: "Removing a pack from the Goonpacks list leaves it listed, even when
the removal succeeded." Only right if the entry stays listed on screen is what
was seen. The code path no longer shows it — `use-goonpack-library.ts:232-240`
rebuilds the index after `removePackTree`, and a disk pack offers no Remove
button at all (`goonpacks-panel.tsx:198-212`).

**6b.** Deleting `- Other entries in this braindump are Companions UI too.` Two
independent style passes flagged it as naming no defect. It does tell a reader
reworking the Companions UI to read the rest of the list. That is why it stands.

## 7. GOONPACKS.md — two additions rather than corrections

**7a. Caption weighting and the synonym table.** GOONPACKS.md is the pack
format's reference for authors, and its caption advice leaves out the two things
that decide how a caption behaves. `media-search.ts:90` sets
`CAPTION_WEIGHT = 2` and `:118-119` adds it for a caption hit against 1 for a
description hit, which is the reason for "a caption should say what's actually
in the shot". `media-search.ts:67-75` folds synonym groups
(`breasts/boobs/tits`, `panties/knickers`) to one word before scoring, so which
word of a group a caption uses makes no difference. A word outside those groups
has to be written to be found.

**The resulting text**, replacing the caption paragraph:

    A search matches the request's words against the caption and the description
    together, weighting a caption hit above a description one. Each hit comes back
    with its caption, and the companion chooses from those. A caption should say
    what's actually in the shot; a word that appears only in the description will
    still find the item, just less strongly. Words for the same thing are folded
    together before either is scored, so a caption saying "breasts" answers a
    request for "tits" — the table is in `src/lib/companions/media-search.ts`.

**7b. Two absolute GitHub links.** `ambient.ts` and
`goonpacks/elise/system-prompt.md` are linked as
`https://github.com/autogoon/autogoon/blob/main/…` while every other in-repo
link in the file is relative. The absolute pair pins `main`, so a branch reader
gets `main`'s copy of a file the branch may have changed. Settle one way:
relative everywhere, or absolute for the two files an author might read outside
a checkout.

## 8. modes/COMPANIONS.md is a developer doc in a user-facing directory

**The problem.** CLAUDE.md → Documentation says "README, MODES.md and
`modes/*.md` are **user-facing**: no repo mechanics (committed/gitignored,
generated modules, script internals). That belongs in DEVELOPERS.md,
ARCHITECTURE.md, or the code." modes/COMPANIONS.md is written as a developer
doc. Its own second sentence says so: "This doc carries the design rationale."

**The evidence.** These are the doc's subject matter rather than pointers:
`Companion`, `COMPANIONS`, `companionList`, `aimee-prompt.ts`, `localStorage`,
`threadKeyFor`, `use-voice-session.ts`, `conversation.ts`, `passesReasoning`,
`reasoning_details`, `shared-prompt.ts`, `{{tokens}}`, `fillSharedSections`,
`companions-panel/index.tsx`, `systemPrompt`, `getDeviceState`, `tool_calls`,
`MAX_TOOL_ROUNDS`, `access-check.ts`, `LLM_URL`, `OPENROUTER_API_KEY`,
`COMPANIONS_ACCESS_IDS`, `.env`. Four whole sections — "The model", "One config
object per companion", "Shared prompt sections", "Configuration" — carry no
sentence a user could act on.

GOON.md, GROOVE.md and AUTOPILOT.md each carry one pointer line to
ARCHITECTURE.md and none of the repo's mechanics. That is the shape the rule
describes.

**The options.**

- **Split it** — a user-facing modes/COMPANIONS.md (what a companion does, how
  to talk to one, what the knobs do), with the design rationale moving to
  ARCHITECTURE.md or a doc of its own. Most work, and it is the only option that
  satisfies the rule as written.
- **Leave it and amend the rule** — name COMPANIONS.md as the stated exception
  in CLAUDE.md, on the grounds that the play mode's cloud pipeline has no
  user-facing explanation that is worth anything without the mechanism.
- **Leave it and say nothing** — the rule then has a standing breach that every
  `/doc-check` will re-report.

This is a relocation rather than a rewrite, so there is no replacement text.

## 9. A real place name in a persona example

Raised by a style pass for `/personal-check` to rule on rather than settled
here. modes/COMPANIONS.md now reads:

    Personas are written in the **second person** ("You're 23, from just outside
    Manchester…") so they read as one voice with the shared blocks.

The quote was corrected from "You're 21…", which matched no persona, to
`aimee-prompt.ts:24`, which is a committed file in the public repo — so the
place name is already published and this adds no new exposure. Flagged because
it is a real place in a doc rather than in persona copy.

## 10. TODO.md — "the companions themselves aren't gendered"

**The problem.** The sentence is false as written, and correcting it turns on
what was meant, which changes the argument it supports.

**The evidence.** Under "Reconsider the second person the prompts assume":

    But it is an assumption sitting in copy rather than a setting, and the
    companions themselves aren't gendered anywhere else in the app.

Companions are gendered: `manifest.ts:74` is
`gender?: 'female' | 'male' | 'nonbinary'`, `resolve.ts:61` defaults it to
female, and TODO.md itself says elsewhere that an overlay may change everything
"except `name` and `gender`".

**The options.** The parallel that makes the argument work is about the _user_,
not the companion — the user's gender is assumed in prompt copy and set nowhere
else. If that is what was meant:

    But it is an assumption sitting in copy rather than a setting, and the user
    is not gendered anywhere else in the app.

If the companions really were the point, the sentence needs a different fact,
because that one is contradicted by the manifest.

## 11. modes/GROOVE.md — the interior variability levels

The two variability bullets give `off` and `high` and describe `low`/`medium` as
"each level up". The engine has all four: `DIP_FLOOR` is
`{ off: 60, low: 40, medium: 20, high: 0 }` (`groove-engine.ts:26-31`) and
`TIMING_PERCENT` is `{ off: 0, low: 25, medium: 50, high: 75 }`
(`groove-engine.ts:15-20`).

CLAUDE.md → Documentation says `modes/*.md` states its play mode's engine values
— "speed ranges, dip floors, durations, knob defaults" — which argues for all
four. The current prose is accurate as it stands, and adding four numbers
changes the bullets' shape, so this is a restructuring rather than a correction.

## 12. The media-set counts are published; the fix is not

**The problem.** The two Secrets breaches this sweep found are fixed locally
only. `ef9adfc` took both out, and `origin/main` is six commits behind `HEAD` at
`e44496b`. Pushing stops them being read going forward. It does not unpublish
them: they were merged as PR #30.

**The evidence.**
`git show origin/main:src/inference/experiments/2026-08-02-baseline/README.md`
holds the described-item count of the local set, with the search phrase that
matched it;
`git show origin/main:src/inference/experiments/2026-08-02-baseline/index.ts`
holds the count of stored replies over that same set. `98800c7` introduced the
README count.

CLAUDE.md → Secrets is explicit about what this costs: "`/personal-check` is the
backstop, not the defence. History rewrites are the only fix once pushed."

**The options.**

- **Accept it.** Push the fix and let the history stand. The counts stay in the
  repo's public history and in anything that mirrored it.
- **Rewrite history.** Takes them out of the published commits, at the cost of a
  force-push. GitHub retains orphaned objects regardless, so the exposure is
  reduced rather than ended.

Nothing here is a name, a path or a person: it is the size of a private media
set and one search phrase. That is what makes accepting it plausible.

**Whichever you choose**, `/personal-check` would not have found these. Its
default scope is the branch — `main..HEAD`, every revision of every file the
branch changed — and both counts were committed on `main` before this sweep
started, so no revision walk over these commits reaches them. Only
`/personal-check all` reads the whole tree, and the sweep that found them was
`/md-check` reading every file. Nothing in the skill has been changed.

## 13. The keyword spotter asks for no audio constraints

**The problem.** Not a doc question — a possible defect the doc-check turned up.
`roadmap/KEYWORD-DETECTION.md` said "the browser's own noise cancellation
already handles audio the machine itself is playing". The doc now says echo
cancellation and notes the gap; whether to close the gap is open.

**The evidence.** The Companions mic asks for all three constraints by name
(`src/lib/voice/mic.ts:53-58`):

    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },

The keyword spotter's only `getUserMedia` call asks for none of them
(`src/components/keyword-spotter.tsx:238-240`):

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 },
    });

So on the built-in play modes, whether audio the app is playing is cancelled
before it reaches the recognizer rests on a per-browser default across Chromium,
Firefox and WebKit. Goonpack video playing behind a play screen is the case that
matters: a false detection there runs a command on the device.

**The options.** Add the three constraints to the spotter's call, matching the
Companions path — one edit, and it makes the two mic paths consistent. Or leave
it and treat the defaults as sufficient, in which case
`roadmap/KEYWORD-DETECTION.md`'s new sentence should say so rather than flagging
it.

## 14. INFERENCE.md transcribes the UI spec's reasoning

**The problem.** Six passages of `docs/2026-08-02-inference-ui-spec.md` are
restated near word-for-word in INFERENCE.md, and four of those a third time in a
code comment. CLAUDE.md → Documentation: "A rule, list or procedure is stated in
exactly one place and everywhere else points at it."

**The evidence.** The six, each with its third copy where there is one:

- the corpus directory listing — spec, INFERENCE.md, and `paths.ts:9-16`. The
  copies have already drifted: INFERENCE.md carries a `beach.md` line the spec's
  does not;
- the archive naming and why time comes before version — spec, INFERENCE.md,
  `paths.ts:18-26`;
- "an absent field is one nobody has answered", with its reasoning — spec,
  INFERENCE.md, `labels.ts:1-9`, the last two nearly verbatim;
- `unknown` is a value like any other — spec, INFERENCE.md, `fields.ts:47-51`;
- a prompt and its reply are a numbered pair — spec, INFERENCE.md,
  `paths.ts:56-59`;
- `run()` / `parse()` and per-record parameters — spec, INFERENCE.md,
  `experiment.ts:7-11` and `runs.ts:4-9`.

Six code comments already cite the spec by name for this reasoning
(`experiment.ts:3`, `runs.ts:2`, `paths.ts:4`, `labels.ts:4`, `fields.ts:3`,
`dev-only.ts:10`), so the spec is where the reasoning lives and the citations
are working as intended.

**The options.**

- **Cut INFERENCE.md's copies back to the facts, pointing at the spec for the
  why.** The largest edit, and it makes a current-state doc depend on a dated
  one — which is backwards for a reader who wants to know how the thing works
  today.
- **Leave INFERENCE.md as the single source and let the spec be the record**, on
  the grounds that a dated doc is allowed to be superseded and nobody reads it
  first. Then the code comments should cite INFERENCE.md rather than the spec.
- **Leave both.** Two copies drift, and one pair already has.

No replacement text: the unit is a document, and which of the two is the source
is the decision.

## 15. The UI spec records boundaries that were later crossed

**The problem.** Four things `docs/2026-08-02-inference-ui-spec.md` states as
settled have since been reversed. A dated spec is a record, so rewriting it
falsifies that record — but leaving it silent means a reader takes a reversed
decision as current, and one of them is cited by a code comment.

**The evidence.**

- **Experiments "frozen once it has run"** (spec → Experiments). Reversed:
  `experiment.ts:1-5` says "It is edited and re-run like any other code; what
  keeps its results readable is that each one records the version of the
  directory that produced it", and cites this very section by name.
  `INFERENCE.md` → Experiments agrees with the code.
- **"its output never reaches a pack."** Reversed:
  `npm run goonpack:build <pack> <experiment>` builds a pack from an
  experiment's sidecars, and the Companions card's Descriptions select plays
  them.
- **Not in v1** (spec → Not in v1): any field but `naked`, batch running an
  experiment over the corpus, and any comparison view. All three shipped;
  scoring and diffing two runs, in the same bullet as the comparison view, did
  not.
- **The `src/inference/` file tree** lists seven modules; twenty-five sit there
  now, and `panel.tsx` is no longer the only screen — it renders the corpus
  summary itself and hands one item open for review to `review.tsx`
  (`panel.tsx:40`).

**The options.** A dated **Superseded** note under each, naming what replaced it
and pointing at INFERENCE.md — which keeps the record and the reason, and is
what the freezing one needs, since `experiment.ts` cites it. Or leave all four
and accept that the file is read as history only.

The freezing one is the one that matters: a code comment sends a reader to a
section stating the reverse of the invariant the code holds.

## 16. Two files list what the descriptions get wrong

`docs/2026-08-02-describe-accuracy.md` → What it gets wrong lists five failures
— bare-vs-covered breasts, nipples through fabric, body orientation,
sitting-vs-kneeling, multiple subjects.
`src/inference/experiments/2026-08-02-baseline/README.md` → describe-image.ts
prompt states four of them, and the single-female-subject assumption in a
sentence after the list. Its What is working section carries a verdict on two:
"Topless vs bare breasts is largely better", "Nipple visibility is noticeably
better".

Collapsing the dated file's list to a pointer would gut the observations it
exists to hold. Leaving both means it is maintained twice and the README is
already ahead on two of the five. The middle option is one sentence after the
list, and the precedent is in the same file: What it never reports already sends
breast size to that README.

    How these have gone since is in [the baseline experiment's README](../src/inference/experiments/2026-08-02-baseline/README.md).

## 17. The baseline experiment's README opens on a problem it never resolves

Two findings on `src/inference/experiments/2026-08-02-baseline/README.md`, both
needing someone who knows what happened rather than what the code says.

**Pose has no verdict.** The README opens its problem statement with "Sitting vs
kneeling down vs kneeling up" and makes describing pose a goal. There is no pose
field — `fields.ts` has none, and pose is asked for in prose only, landing in
`description`, which nothing scores. Neither "What is working" nor "What isn't
working" mentions it. It needs one line saying pose is still free text and
therefore unscored, under whichever of those two headings is true.

**Two general statements sit in one experiment's README:** "As with all
experiments, nothing in here might make it into the core." and "An outline of
what is being investigated, not a specification or a plan." Neither is
particular to the baseline, and INFERENCE.md → Experiments already defines what
a README is for. Either move the pair into INFERENCE.md or delete them here. The
first sentence also says the opposite of what it means — it reads as "possibly
none of this reaches core", where the intent is "anything here might not".
