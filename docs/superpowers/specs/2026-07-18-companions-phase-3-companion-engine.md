# Companions — Phase 3: CompanionEngine + narration overlay (Spec)

> Part of the Companions feature. Read
> [`2026-07-18-companions-design.md`](./2026-07-18-companions-design.md) first —
> this phase adds the **`CompanionEngine`**: a self-contained port of
> Autopilot's template-block generation, plus a **narration overlay** that fires
> one cue at every template boundary describing the mini-program starting there.
> Pure engine code, unit-tested like the other engines. **No device, no LLM, no
> panel, no Player arming, no personas** — those are later phases.

## Goal

A `CompanionEngine` that generates an Autopilot-shaped program **and** can hand
back, for any look-ahead window, a list of **narration cues** — one per template
boundary, each carrying a neutral semantic label of the mini-program that starts
there ("slamming between dead slow and full tilt", "teasing climbs, each one
higher"). It implements `AlgorithmEngine` (so a later phase can arm the Player
with it unchanged) and adds a `generateNarrationCues` method the base interface
doesn't have.

Provable entirely in unit tests, exactly like `goon-engine.test.ts`: generation
is random, so tests pin the **contract** (cues land on template boundaries,
every boundary is labelled, speed extends and stays in range) rather than exact
output.

## In scope

- **`CompanionEngine`** (`src/lib/algorithms/companion-engine.ts`) — a faithful,
  self-contained port of `AutopilotEngine`'s generation: the pattern templates,
  constants, block builder, intensity/edge speed scaling, the suction valve
  overlay, and the finish path. **Duplicated, not imported** — engines don't
  import each other (see ARCHITECTURE.md; Goon duplicates Groove for the same
  reason).
- **Knobs**, same shapes as Autopilot: `IntensityLevel` / `EdgeControlLevel` /
  `SuctionControlLevel`, set at construction and via setters.
- **A labelled template table:** each template in the local copy is authored
  with a neutral `label` — a persona-agnostic, present-tense description of what
  that mini-program does. (Labels below.)
- **`NarrationCue`** — a new exported type `{ at: number; text: string }`.
- **`generateNarrationCues(fromTime, untilTime): NarrationCue[]`** — a
  CompanionEngine-only method (not on `AlgorithmEngine`) returning one cue per
  template boundary in the window, `text` = that template's label, sorted
  non-decreasing by `at`.
- **Unit tests** (`companion-engine.test.ts`), contract-style.

## Explicitly out of scope (later phases)

- **Personas / the persona's `traits`.** Generation is driven by Autopilot's own
  knobs this phase. The persona shape (`systemPrompt`, `traits`) and the
  `traits` → Autopilot-params mapping are deferred to when the persona shapes
  the program.
- **Any wiring.** The engine is not armed on the Player, not rendered in the
  Companions panel, not fed to the LLM. `generateNarrationCues` produces data
  nothing consumes yet — a later phase hands it to the orchestration thread.
- **Player lifecycle for cues.** `invalidateFuture()` re-laying cues, and
  pruning spent segments, is a later-phase Player concern. This phase keeps a
  straightforward append-and-window-filter (fine for short-lived unit tests).
- **Cue → speech.** Turning a label into in-character spoken narration, and
  prompting the LLM ahead of the cue's `at`, is orchestration for a later phase.
- **Prompt-ahead lead time / scheduling.** Not modelled here — cues carry the
  raw event time; the lead is applied downstream in a later phase.

## Generation & narration decisions (pinned)

- **Port, don't refactor.** The speed backbone, suction valves, `scale`
  (passthrough), and finish behaviour are Autopilot's, copied verbatim into the
  new file. This phase adds nothing to the motion itself — only the narration
  overlay is new. Keeping the port faithful means the engine is already
  Player-ready for a later phase.
- **Segments are a byproduct of speed generation.** The block builder records a
  segment — `{ at, label }` — at the start of each template it lays down (before
  that template's first step). `generateSpeed` accumulates these into a private
  buffer. Template choice is random _inside_ generation, so cues can only come
  from the same pass that produced the speed — narration can't re-derive
  boundaries from raw speed events. Hence a recorded buffer rather than a pure
  function of `speedEvents` (this is why `generateNarrationCues` reads engine
  state, unlike `generateValves`, which is pure over its inputs).
- **Call order mirrors the Player.** `generateNarrationCues(from, until)` is
  valid after `generateSpeed` has covered `[from, until)` — the same sequencing
  the Player uses for `generateValves`. Tests generate speed first, then read
  cues.
- **One cue per template boundary.** A block lays `TEMPLATES_PER_BLOCK` (10)
  templates; the block's first template cues at the block start, each subsequent
  template at its boundary. Over a look-ahead window that is a cue every ~30 s–2
  min — a sensible companion chattiness for v1.
- **`reset()` clears the segment buffer** (and the finish flags), like the other
  engines clear their transient generation state.
- **Finish emits a single cue.** When `beginFinish()` is active, `generateSpeed`
  emits Autopilot's finish ramp once; `generateNarrationCues` emits one
  finishing cue (label below) at `fromTime`, then nothing (parked).

## The template labels (authored)

Autopilot has eight pattern templates. Each gets a neutral, present-tense label
(the persona voices it in a later phase; here it is plain data):

| #   | Template shape                             | `label`                                                   |
| --- | ------------------------------------------ | --------------------------------------------------------- |
| 0   | `5→100→5`, even 5 s steps                  | `a long, slow sweep all the way up and back down`         |
| 1   | `5→50→5`, even 7 s steps                   | `a gentle, shallow build and ebb`                         |
| 2   | `50 / 100 / 10` surging ×3                 | `surging between a crawl and full pace`                   |
| 3   | `10 ↔ 100` hard, ×4                        | `slamming between dead slow and full tilt`                |
| 4   | climbs to 50, 60, 70, 80, 90, 100 off lows | `teasing climbs, each one higher than the last`           |
| 5   | tiny `5–20` waves                          | `tiny teasing waves down low`                             |
| 6   | full bursts, ever-deeper drops between     | `full-pace bursts with deeper and deeper plunges between` |
| 7   | quick `20→90→100`, hold high               | `a quick rise into a hold near the top`                   |

Finish cue label: `the finish — full and relentless`.

Wording is editable — the test asserts every boundary carries a **non-empty**
label from the table, not the exact strings.

## Proposed module layout

- `src/lib/algorithms/companion-engine.ts` —
  `CompanionEngine implements AlgorithmEngine`; the ported generation + the
  labelled template table + the segment buffer + `generateNarrationCues`.
  Exports `CompanionEngine`, `NarrationCue`, and the three level types.
- `src/lib/algorithms/companion-engine.test.ts` — contract tests (below).

## Behaviour

- **`generateSpeed(from, until, ctx)`** — identical motion to Autopilot: tile
  blocks of 10 random templates until `until`, scaling speed by intensity/edge;
  when finishing, emit the finish ramp once then park. As a byproduct, append a
  `{ at, label }` segment for each template laid.
- **`generateValves(...)`** — Autopilot's suction overlay verbatim (a
  stroke-minus pulse on qualifying speed moves, gated by the suction interval;
  finish closes both valves).
- **`generateNarrationCues(from, until)`** — return the recorded segments whose
  `at` falls in `[from, until)` as `{ at, text: label }`, sorted; during finish,
  the single finishing cue at `from`.
- **`scale(event)`** — passthrough (Autopilot has no magnitude knob).
- **`reset()`** — clear the segment buffer and finish flags.

## Testing

Contract tests (`companion-engine.test.ts`), node env, `@jest/globals`,
mirroring `goon-engine.test.ts`:

- **Speed contract:** walking several look-ahead batches the Player-way, each
  batch is non-empty, sorted non-decreasing, every speed within `[0, 100]`, and
  each batch ends strictly past `fromTime` (no look-ahead spin).
- **Cues land on real boundaries:** after generating speed over a window, every
  cue's `at` coincides with a generated speed-event `at` (a segment starts at a
  template's first event, so a cue never floats between events); cues are sorted
  non-decreasing and all fall within `[from, until)`.
- **Labels come from the table:** every cue's `text` is one of the authored
  labels and is **non-empty**.
- **Cadence:** a window spanning at least one full block yields several cues
  (not zero, not one) — narration actually fires across a block, at the density
  of ~one per template.
- **Finish:** after `beginFinish()`, `generateSpeed` emits an unscaled ramp once
  then parks (`[]`); `generateNarrationCues` returns exactly the one finishing
  cue; `generateValves` closes both valves.
- **`reset()`** clears state: cues and speed generate afresh, and a prior finish
  no longer suppresses generation.
- **Suction valves:** with suction `off`, no valves; with `little`/`more`,
  pulses appear only on qualifying moves and respect the interval (a light
  port-parity check, mirroring Autopilot's own coverage).

Gates: `npm run typecheck`, `npm run lint` (`--max-warnings 0`), `npm test`,
`npm run build` all clean; `npm run format` before finishing.

## Resolved decisions

- **Base:** Autopilot's template-block generation, **duplicated** into the new
  engine (self-contained; no import from `autopilot-engine.ts`).
- **Narration granularity:** one cue per template boundary; the block's first
  template cues at block start.
- **Cue content:** a neutral, persona-agnostic label authored per template; the
  persona voices it in a later phase.
- **`NarrationCue = { at, text }`**; `generateNarrationCues` is a
  CompanionEngine-only method, **not** on the `AlgorithmEngine` interface (the
  Player doesn't consume cues until a later phase).
- **Mechanism:** segments recorded as a byproduct of `generateSpeed`;
  `generateNarrationCues` reads them (it can't re-derive random template choices
  from speed events).
- **Completeness:** the suction valve overlay and the `beginFinish` path are
  ported too, so the engine is a complete, Player-ready port.
- **Knobs:** Autopilot's `IntensityLevel` / `EdgeControlLevel` /
  `SuctionControlLevel`; personas / the persona's `traits` are a later phase.
