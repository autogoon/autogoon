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

## Companions

Remaining companion features — largely independent, picked off in any order,
with any dependencies noted in place (they began as the numbered phase plans of
[#13](https://github.com/autogoon/autogoon/pull/13) and
[#14](https://github.com/autogoon/autogoon/pull/14)). The full design and
rationale live in the design doc:
[docs/superpowers/specs/2026-07-18-companions-design.md](./docs/superpowers/specs/2026-07-18-companions-design.md).
What's already built is described in
[modes/COMPANIONS.md](./modes/COMPANIONS.md).

### Ambient chat

Built on the shipped thread and companion-driven control. Narration and ambient
filler collapse into one source: a self-poke on a **cadence set by her
`chattiness` trait** (from the traits record — see
[Personas shape their programs](#personas-shape-their-programs); whichever
feature lands first introduces it) — every _x_ ± _y_ seconds, no per-event
trigger. The cue carries no payload; the persona decides what to say from the
thread's current + upcoming device state (`player.upcoming`), free to end a turn
in a tool call. Preemptible under barge-in.

**Idle cutoff:** the ambient clock must be _time since the last user turn_ (the
thread's `at` stamps), not since the last turn — her own self-pokes would
otherwise reset it forever. After a while with no user turn she asks "are you
still there?"; unanswered, the self-poke cadence stops (no LLM/TTS spend on an
empty room) until he speaks again — which the gap markers then frame as him
coming back.

### Safeword + barge-in tuning

Vosk KWS reserved for the safeword → hard stop that also tears down the voice
session (LLM + TTS); the nav/global-word lockdown a running session needs;
reconciling the two concurrent mic captures (vosk vs. ElevenLabs STT); plus
further barge-in tuning.

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

### Personas shape their programs

Give each companion her four `traits` (`dominance` / `intensity` / `chattiness`
/ `variety`, 1–5) and map the code-facing ones onto **Groove's knobs** —
`intensity` to the speed-percent magnitude, `variety` to the
timing/dip-variability level; `dominance` gates how often _she_ changes it
unprompted (`chattiness` is consumed by [Ambient chat](#ambient-chat)). A
companion's program stops being random and becomes **hers** — the persona →
program mechanism working end-to-end. This is the missing piece for the
companions' _programs_ (not just their chat) to diverge.

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
[GOONPACKS.md](./GOONPACKS.md). One follow-up remains:

- **Phase 2 — voices from prompts.** A `voiceId` is private to its ElevenLabs
  account, so a pack's voice doesn't truly travel. The follow-up carries a voice
  _prompt_ instead: the app submits it to ElevenLabs voice design, gets three
  candidate voices back, and the user picks or iterates — a small in-app
  recreation of that ElevenLabs UI. v1 ships `voiceId` and accepts the
  limitation.
