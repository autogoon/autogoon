# TODO

Concrete, intended work. Speculative direction and design thinking lives in
[ROADMAP.md](./ROADMAP.md).

## General

- **Show remaining provider credits in the app.** Both providers expose balances
  (OpenRouter's credits endpoint; ElevenLabs' subscription endpoint — character
  quota used/limit), so surface them in the app instead of two dashboards —
  presumably a pair of trivial proxied lookups. Maybe also record usage over
  time (per session?). To settle: where it lives (Settings, or on the Companions
  screen), and how it composes with the bring-your-own-keys feature below (with
  BYO keys it's the _user's_ balance — arguably more useful, same lookups).

- **Finish intensity.** One global percentage in Settings: the intensity you'd
  want to finish at. **Finish** goes to it; **companion-set intensity** is
  multiplied by it (they set 100, it lands on 50, and they never see the setting
  or the scaled number); and **the wind-down** starts at it and ramps down.
  Torture and the two ruins don't take it — they're absolute on purpose — and
  Autopilot doesn't change, being a faithful recreation of the Vacuglide
  algorithm. A companion picking a number has no idea what it does to you, and
  the only fix today is saying so in words, every session and every new
  companion.

- **Put the wind-down on a curve.** It glides down in two straight-line phases.
  Give it the `RAMP_GAMMA` curve Goon's dips ramp on, so it thins out as it
  approaches a standstill instead of stepping evenly the whole way — a 5-unit
  change at speed 10 is felt far more than the same change at speed 90. Goon,
  Groove and Companions each carry their own copy of the constants.

## Media descriptions and retrieval

**The next thing.** A companion with a collected set of a couple of thousand
pictures can't use them: every item's description goes into the `send_media`
schema and she picks by number, which stops working long before the window fills
— a model choosing between two thousand near-identical descriptions chooses
badly. And the descriptions themselves are written for one woman alone in a
pose, so a second body, a man, and anything happening between people have
nowhere to go.

The target design — what she's asked for, who does the searching, what gets
stored per item — is
[roadmap/INFERENCE-LIBRARY.md](./roadmap/INFERENCE-LIBRARY.md). The short of it:
she asks in words, the app searches, and the tool result tells her what actually
went. What's below is the work, staged so each stage answers one question and
the next depends on it. Stages 0–2 are worth doing even if the retrieval half
slips.

### Stage 0 — the yardstick

A yardstick of around a hundred images, deliberately loaded with the hard cases:
sheer versus opaque, nipples through fabric, topless versus covered, a cock in
frame, penetration, oral, more than one person, watermarks, near duplicates.
Hand-write the ground truth once.

It's a dull afternoon's work and nothing else should start first — without it
every later comparison is an impression rather than a number, which is exactly
how the current prompt got to be confidently wrong in a few places.

### Stage 1 — what a description should contain

Two texts per item, not one: a long description of everything in the picture,
and a one-line caption condensed from it. `scripts/describe-image.mjs` already
works this way — it has the model observe at length and then condense — and
currently throws the observations away, so this is mostly plumbing rather than
new inference.

The schema needs rescoping. Establish the scene first — how many people, which
sexes, what is happening between them — then describe each person, then any text
in the image. Two specific errors to chase while here: bare breasts called
covered and covered called bare, which is a discrimination the prompt already
asks for explicitly; and nipples through fabric missed, where the suspect is
that prompt's own anti-false-positive wording over-correcting into false
negatives — a one-line change with a measurable answer.

**Blocking decision:** two texts plus an attribute panel outgrows the one-line
`.txt` sidecar that `parsePack` reads straight in as a description. Settle the
sidecar's shape before anything writes captions at scale, since it's a pack
format change.

### Stage 2 — model and resolution

Same yardstick, same prompt. Vary resolution and tiling first — that's the
bigger lever for fine detail and it's a config rather than a model swap — then
compare three or four models with a frontier one as the ceiling. Settles whether
the remaining errors are the model or the prompt, and picks the model for the
bulk pass.

### Stage 3 — retrieval, offline

Thirty to fifty realistic requests in a companion's own words ("her on her knees
looking up", "something with a man in it", "topless but not explicit", "filthier
than the last one"), scored by hand against four implementations: a cheap LLM
reading all the captions; caption-embedding top-k; top-k plus an LLM rerank over
the long descriptions; and the same with an image embedding added.

The output is the minimum that works and where it breaks — which is what decides
the shape of the tool. Also settled here: whether hard constraints (no nudes
ever; must contain a man) need the structured attribute filters or fall out of
ranking.

### Stage 4 — the set summary

An LLM over all the captions, producing a paragraph on what the collection is —
proportions, who's in it, which acts appear, the range of undress. Test whether
a companion given only that asks answerable questions and stops offering what
isn't there.

Open while testing: whether one neutral summary serves every persona, or whether
it wants generating per persona — different companions care about different
dimensions of the same facts, and a neutral one stays cacheable.

### Stage 5 — wire it in

Only now: the tool takes a description instead of a number, the summary goes
into the prompt like the other app-owned sections, and the index gets somewhere
to live. Two things fall out for free at this point — `send_media`'s argument
stops being a positional index, which today means a historical call in a thread
can denote a different picture once a pack version or overlay changes the set;
and the search owns "don't send the same thing twice", which nothing does today.

## Companions

Remaining companion features — largely independent, picked off in any order,
with any dependencies noted in place (they began as the numbered phase plans of
[#13](https://github.com/autogoon/autogoon/pull/13) and
[#14](https://github.com/autogoon/autogoon/pull/14)). The full design and
rationale live in the design doc:
[docs/superpowers/specs/2026-07-18-companions-design.md](./docs/superpowers/specs/2026-07-18-companions-design.md).
What's already built is described in
[modes/COMPANIONS.md](./modes/COMPANIONS.md).

### Split the voice session and the companions panel

`use-voice-session.ts` (~850 lines, ~20 refs in one closure) and
`companions-panel/index.tsx` (~1000) have both accreted past what's comfortable
to hold in the head. The coupling is load-bearing rather than careless — the mic
and STT callbacks are created once and outlive many renders, so everything they
read has to be a ref — which is why "just split it" isn't the fix.

Three seams are visible in the hook. **Thread persistence** (`persistThread`,
`clearThread`, the load effect) touches two refs and nothing else: a clean lift
with no design needed. **The turn runner** — `submitText` and its helpers: LLM
streaming, metrics, tool dispatch, the reaction, the TTS handoff — is the bulk
and needs most of the refs, so extracting it means inventing an explicit
session-context to carry them, which is the real work and the reason this hasn't
happened. **What remains** is the mic/STT/VAD wiring and start/stop, which is
what a hook of that name should mostly be.

### Activity cutoff

A spend backstop, separate from ambient chat's own `wait_for_user` stop (shipped
— see [modes/COMPANIONS.md](./modes/COMPANIONS.md)): after long enough with no
sign of anyone — no user turn, no control touched — stop the program. Stopping
the program already stops ambient chat, so the one cutoff covers a session left
running in an empty room, which is where LLM and TTS spend would otherwise run
indefinitely.

The hard part is the number, not the mechanism. Long silences during play are
normal — the device is working and there is nothing to say — so a cutoff tuned
for an empty room must not fire on someone who is simply quiet. Worth warning
before it stops rather than stopping silently.

### Safeword as a hard stop

Vosk KWS reserved for the safeword → a hard stop that tears down the voice
session (LLM + TTS), not just the device. Today the safeword only pauses the
Player, so she keeps talking through it; and it is only in the grammar while a
program runs, so with the device stopped there is no spoken way to stop her at
all. Also the nav/global-word lockdown a running session needs, and reconciling
the two concurrent mic captures (vosk vs. ElevenLabs STT) so the word that stops
her isn't also transcribed as a turn.

### Context compaction / rolling window

Keep the ever-growing thread within the model's context (recorded per companion
as `contextWindow`): summarize older turns and/or keep a rolling window of
recent turns verbatim, trimming old `reasoning_details` along with the messages
they belong to. Headroom for very long sessions rather than a near-term limit.

### Turn-commit review, reply-length tuning & prompt polish

With the loop running on hardware, tune the conversational feel: revisit the
interrupted-turn commit rule (the user turn is committed immediately, the
assistant turn only on generation-complete, which can leave a dangling user turn
when a mid-generation barge-in cuts a reply before it finishes) — confirm or
adjust; keep replies short enough for TTS latency; and a review/polish pass over
the system prompts. _(The on-hardware feel tuning remains.)_

### The companion picks the after-play

The companion gets a tool for each after-play and picks which one to use when
you say you're cumming. The persona decides, so the ending stops being a setting
and becomes something she does to you. And because she can choose, she can say
she will without saying which.

### Pick packs up off disk in dev

Iterating on a pack means: edit, `npm run goonpack:build`, open the Goonpacks
tab, pick the zip, confirm the replace. Every time. The build is the only step
doing anything the app couldn't do itself.

On a locally-run server, have the app ask a route on load what pack directories
are sitting in `goonpacks/`, and import each one exactly as though it had been
chosen in the picker and replaced — the same validation, the same storage.
Reload becomes the whole loop.

The source directory rather than a built zip, because validation now runs on the
extracted tree: the tree is the thing that ships, and the zip only carries it,
so importing the directory imports what would ship. That also drops the build
step from the loop entirely.

Deliberately not watching for changes: load-time only. A reload is a small
enough ask, and polling can come later if it isn't.

**Dev-server only, and it has to be enforced server-side.** The route reads the
developer's own filesystem, which is exactly what a deploy must not do —
`access-check.ts` already has the `NODE_ENV === 'development'` precedent to
follow. Also worth deciding what happens when a disk pack and an installed one
collide, and whether a pack imported this way should be visibly marked as having
come from disk rather than chosen.

A stopgap, not the destination — [Goonpack kit](./roadmap/GOONPACK-KIT.md) is
where authoring properly moves into the app. This is worth doing anyway because
it's small and pays off immediately.

### Streaming per companion

`stream: true` is hardcoded for every request, and on a spoken turn it buys
nothing: the reply is buffered in full and handed to TTS complete (the
`submitText` comment in `use-voice-session.ts` says so). All streaming does is
fill the transcript word by word — nice on a typed turn, invisible on a voice
one, because the audio can't start until the text is finished anyway.

So make it a per-companion field like `model` and `passesReasoning`, and a
manifest field packs can set.

**The reason this is worth building: it's what rules MiniMax M3 out today.** The
problem there was specifically in the streamed response — OpenRouter not cleanly
separating the model's reasoning from its reply, so thinking leaked into what
the companion said. A non-streamed response carries them as separate fields and
can't blur the two, which makes "don't stream" the fix rather than a workaround,
and hands back a model currently unusable for a reason that has nothing to do
with the model itself.

Two things to handle when it's built: `reasoning_details` and `tool_calls` are
currently assembled from stream deltas (`mergeReasoning`, `mergeToolCalls` in
`llm/client.ts`), so the non-streamed response shape needs its own path to the
same place; and the transcript should show something sensible while a
non-streaming turn generates, since there'll be no text arriving until it's
done.

### Pin a provider, and see what upstream actually said

Two things that made a five-minute throughput test into a long one.

**Choosing the provider.** A companion's model is a slug and nothing more, so
routing is whatever OpenRouter decides — `:nitro` sorts by throughput and can
land consecutive turns on different providers. What prompted this: whichever
provider mimo landed on was badly slow, with no way to say "not that one". A
guess worth testing rather than believing — that throughput routing leans on
figures too coarse or too stale to notice a provider degrading in the moment, so
a spike takes a while to route around. That makes provider-level comparison
impossible to do by hand, and it defeats prompt caching, which is per-provider.
Wants to be a setting rather than an edit: a provider (or endpoint tag, e.g.
`xiaomi/fp8`) sent as OpenRouter's `provider` field, with fallbacks off so a pin
that can't be served fails loudly instead of quietly going elsewhere. Worth
surfacing which provider actually served a turn, too — it comes back on every
response.

**Seeing the error.** `/api/llm` turns any upstream failure into a flat 502 with
upstream's own message discarded, so a provider rejecting a request is
indistinguishable from the key being wrong. Pass the status and body through:
the one that cost the most time here said exactly what was wrong
(`messages[31].tool_calls[1] is missing a function name`) and we couldn't see
it.

That error is also a real bug worth chasing separately: a stream can open a
tool_call index that never gets a name, and we persist it — so it replays on
every later turn and a strict provider rejects the whole conversation. Clearing
the thread is an acceptable fix for an already-poisoned one; what matters is not
writing a nameless call in the first place, and skipping one (and its orphaned
result) when projecting an old thread.

### Reconsider the second person the prompts assume

The shared prompt and the ambient cue both address the user as "he" throughout,
and the toy-start rule doubled the density of it. The premise is reasonable —
it's a male masturbator, so nearly every user is male — but it's an assumption
baked into copy rather than a setting, and the companions themselves aren't
gendered anywhere else in the app.

Worth deciding deliberately rather than by default. The options are roughly:
leave it (and say so somewhere, so it reads as a choice); neutralise the prompt
copy; or make it a setting, which is the most work and the only one that costs a
compatibility surface — pack prompts are author-written and would have to follow
whatever convention is picked. Note that neutral pronouns in prompt copy also
cost some clarity: "he" and "she" in the same block disambiguate who is being
talked about in a way "they" twice over does not.

### Personas shape their programs

Map a companion's traits onto **Groove's knobs** — `intensity` to the
speed-percent magnitude, `variety` to the timing/dip-variability level — so her
program stops being random and becomes **hers**. This is the missing piece for
the companions' _programs_ (not just their chat) to diverge.

**First settle which of these are code at all.** `chattiness` and `playfulness`
shipped with ambient chat because they drive a timer. The rest may not need any:
`dominance` is really how readily a companion overrides what you asked for, and
that is a disposition the system prompt can carry on its own — plausibly
`variety` too. A trait only earns a manifest field and a mapping if code reads
it; one that only colours how a companion behaves belongs in the prompt, where
an author can already write it. Work out which is which before adding fields,
because a manifest field is a compatibility surface and packs in the wild make
it expensive to take back.

### Trait-driven companion contrast

Depends on [Personas shape their programs](#personas-shape-their-programs) —
it's that feature's payoff, kept separate because it's the thing to _prove_:
character bends _both_ the chat _and_ the generated program. The chooser and the
further companions (Aimee, Miley) have shipped; today their contrast is
prompt/disposition-only, because the personas' programs don't yet diverge by
trait.

### Bring-your-own API keys

Move the paid services (LLM, TTS, STT) onto keys the **user supplies in the
app** instead of the server's `.env` — entered once, stored client-side, never
on the server. This is what makes a **hosted public build** viable: every user
funds their own usage, so there's nothing for accounts or per-user rate limiting
to protect. [Goonpacks](#goonpacks) are orthogonal — an imported pack runs on
whatever keys the build has (locally the server's `.env`, on a hosted build the
user's own), the same way companions do today.

To settle: whether the browser calls providers directly or the proxy routes
accept the user's key per-request, and what `.env` keys remain as a local-dev
convenience. The demo access gate (`COMPANIONS_ACCESS_IDS`) **retires with the
server keys** — its only job was protecting them.

### Companion time zones

The personas are located (Riga, Pembrokeshire, Portland) but only the user's
clock is real — the prompt's TIME line is his browser's time. Give a located
persona her own: an IANA `timezone` field on `Companion` and a second TIME line
("TIME (yours, in Riga): …") rendered via `Intl`'s `timeZone` option, so it can
be the middle of her night in the middle of his day. The app does all the
arithmetic — no LLM offset math (models are passable at offsets and quietly
wrong about DST); she only roleplays the two clocks.

One rule ships with it: her clock colours the fiction, never gates it — she
never refuses to play because it's 4am where she lives.

## Goonpacks

Goonpacks — importing a companion as a portable pack — has shipped; see
[GOONPACKS.md](./GOONPACKS.md). Two follow-ups remain:

- **Accept `.gif` as media.** A collected set will have the odd animated gif in
  it, and today import rejects it as an unsupported file. The reason `.mov` is
  excluded — it plays in Safari and unreliably elsewhere — doesn't apply: a gif
  animates in an `<img>` everywhere. It's an entry in `MEDIA_TYPES`
  (`src/lib/goonpacks/media.ts`), whose only non-test consumer is `parsePack`,
  plus `IMAGE_RE` in `scripts/describe-missing.mjs`, which would otherwise skip
  gifs and leave them silently uncaptioned; `scripts/describe-image.mjs` already
  accepts one and describes its first frame. Two things to settle: the `kind`
  has to be `image` either way (`<video>` can't play a gif), so an animated one
  — a gif may equally be a still — arrives labelled a picture, which is a
  mislabel only worth sniffing frames for if it grates; and whether a widening
  like this wants a `PACK_FORMAT` bump — an older app rejects the gif by name
  rather than misreading the pack, which argues it doesn't.

- **Phase 2 — voices from prompts.** A `voiceId` is private to its ElevenLabs
  account, so a pack's voice doesn't truly travel. The follow-up carries a voice
  _prompt_ instead: the app submits it to ElevenLabs voice design, gets three
  candidate voices back, and the user picks or iterates — a small in-app
  recreation of that ElevenLabs UI. v1 ships `voiceId` and accepts the
  limitation.
