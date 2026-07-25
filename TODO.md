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
filler collapse into one source: at the end of each of her turns she schedules
the next one, so a silence is filled by her rather than by a clock watching for
it.

**The loop.** She replies; as that reply finishes, a poke is scheduled for _x_ ±
_y_ seconds' time. A confirmed partial cancels it — a real turn is already on
its way, so there is nothing to fill. A poke that does fire runs a turn on no
payload: the persona decides what to say from the thread and the device's
current + upcoming state (`player.upcoming`), is free to end the turn in a tool
call, and schedules its own successor. Preemptible under barge-in like any other
reply.

**She decides when to stop, not a timer.** The system prompt tells her she may
ask whether you're still there once you've been quiet a while, and that a reply
carrying `WAIT_FOR_USER` schedules no successor — the same marker for when she
judges the conversation finished. The marker is stripped before TTS. Only your
next turn restarts the loop, which the gap markers then frame as you coming
back. This is what makes the cadence self-limiting: she knows whether there is
anything left to say, and a clock doesn't.

**Nothing else gates it.** Not the mic, not a running program: she decides
whether there is more to say, so a second gate would only mute her where she'd
be welcome. The scheduler is wall-clock and belongs to the voice session — never
to the program, whose events are dropped on every regeneration and scale with
playback rate, neither of which should touch her cadence. The cost of dropping
the gate is that stopping the program no longer stops her; walking away leaves
her poking until she gives up, which is what [Activity cutoff](#activity-cutoff)
backstops.

**Cadence** comes from `chattiness`, an optional per-companion manifest field
(1–5), in **seconds**. The shape to design for is the one that motivates the
feature: you're mid-play, lying back, letting her drive — she should fill that
readily. The other traits arrive with
[Personas shape their programs](#personas-shape-their-programs), the work that
actually consumes them.

### Activity cutoff

A spend backstop, separate from [Ambient chat](#ambient-chat)'s own
`WAIT_FOR_USER` stop: after long enough with no sign of anyone — no user turn,
no control touched — stop the program. Stopping the program already stops
ambient chat, so the one cutoff covers a session left running in an empty room,
which is where LLM and TTS spend would otherwise run indefinitely.

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
