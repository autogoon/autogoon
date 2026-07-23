# TODO

Concrete, intended work. Speculative direction and design thinking lives in
[ROADMAP.md](./ROADMAP.md).

## Companions — remaining phases

Carried over from the phase plans of
[#13](https://github.com/autogoon/autogoon/pull/13) and
[#14](https://github.com/autogoon/autogoon/pull/14). The full design and
rationale live in the design doc:
[docs/superpowers/specs/2026-07-18-companions-design.md](./docs/superpowers/specs/2026-07-18-companions-design.md).
What's already built is described in
[modes/COMPANIONS.md](./modes/COMPANIONS.md).

- **Phase 7 — Ambient chat.** Built on Phase 5's thread and Phase 6's
  companion-driven control. Narration and ambient filler collapse into one
  source: a self-poke on a **cadence set by her `chattiness` trait** (introduced
  here) — every _x_ ± _y_ seconds, no per-event trigger. The cue carries no
  payload; the persona decides what to say from the thread's current + upcoming
  device state (`player.upcoming`), free to end a turn in a tool call.
  Preemptible under barge-in.
- **Phase 8 — Safeword + barge-in tuning.** Vosk KWS reserved for the safeword →
  hard stop that also tears down the voice session (LLM + TTS); the
  nav/global-word lockdown a running session needs; reconciling the two
  concurrent mic captures (vosk vs. ElevenLabs STT); plus further barge-in
  tuning.
- **Phase 9 — Context compaction / rolling window.** Keep Phase 5's ever-growing
  thread within the model's context (recorded per companion as `contextWindow`):
  summarize older turns and/or keep a rolling window of recent turns verbatim,
  trimming old `reasoning_details` along with the messages they belong to.
  Headroom for very long sessions rather than a near-term limit.
- **Phase 10 — Turn-commit review, reply-length tuning & prompt polish.** With
  the loop running on hardware, tune the conversational feel: revisit the
  interrupted-turn commit rule (the user turn is committed immediately, the
  assistant turn only on generation-complete, which can leave a dangling user
  turn when a mid-generation barge-in cuts a reply before it finishes) — confirm
  or adjust; keep replies short enough for TTS latency; and a review/polish pass
  over the system prompts. _(Elise's prompt has had one rewrite pass; the
  on-hardware feel tuning remains.)_
- **Phase 11 — Personas shape their programs.** Give Elise and Aimee their four
  `traits` (`dominance` / `intensity` / `chattiness` / `variety`, 1–5) and map
  the code-facing ones onto **Groove's knobs** — `intensity` to the
  speed-percent magnitude, `variety` to the timing/dip-variability level;
  `dominance` gates how often _she_ changes it unprompted. A companion's program
  stops being random and becomes **hers** — the persona → program mechanism
  working end-to-end. This is the missing piece for the two companions'
  _programs_ (not just their chat) to diverge.
- **Phase 12 — Contrasting companion (remaining half: trait-driven program
  contrast).** The chooser and the second companion (Aimee) have shipped. What
  remains is the end goal: proving character bends _both_ the chat _and_ the
  generated program. Today the contrast is prompt/disposition-only, because the
  personas' programs don't yet diverge by trait — so this completes together
  with Phase 11.
- **Phase 13 — Bring-your-own API keys.** Move the paid services (LLM, TTS, STT)
  onto keys the **user supplies in the app** instead of the server's `.env` —
  entered once, stored client-side, never on the server. This is what makes a
  **hosted public build** viable: every user funds their own usage, so there's
  nothing for accounts or per-user rate limiting to protect, and it's a
  **prerequisite for [goonpacks](./roadmap/GOONPACKS.md)** (a portable pack's
  persona needs a voice and a model wherever the app is hosted). To settle:
  whether the browser calls providers directly or the proxy routes accept the
  user's key per-request, and what `.env` keys remain as a local-dev
  convenience. The demo access gate (`COMPANIONS_ACCESS_IDS`) **retires with the
  server keys** — its only job was protecting them.
