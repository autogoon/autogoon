# Companions Phase 3 — CompanionEngine + narration overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `CompanionEngine` — a self-contained port of Autopilot's
template-block generation — plus a narration overlay that returns one cue per
template boundary, each labelled with a neutral description of the mini-program
starting there.

**Architecture:** The engine copies Autopilot's generation verbatim (templates,
constants, block builder, intensity/edge scaling, suction valves, finish), so it
already satisfies `AlgorithmEngine` and is Player-ready for a later phase. The
pattern-template table is extended so each template carries a `label`. The block
builder records a `{ at, label }` narration segment at the start of each
template it lays; `generateSpeed` accumulates these, and a new
CompanionEngine-only method `generateNarrationCues(from, until)` returns them
windowed. Nothing consumes the cues yet — that is a later phase.

**Tech Stack:** TypeScript, the `AlgorithmEngine` contract in
`src/lib/program.ts`, Jest (`@jest/globals`, node env, colocated `*.test.ts`).

## Global Constraints

- Read first: the design
  `docs/superpowers/specs/2026-07-18-companions-design.md` and this phase's spec
  `docs/superpowers/specs/2026-07-18-companions-phase-3-companion-engine.md`.
- **Self-contained engine:** `companion-engine.ts` must **not import** from
  `autopilot-engine.ts` (or any other engine). Duplicate what it needs — engines
  don't import each other (ARCHITECTURE.md; Goon duplicates Groove).
- `generateNarrationCues` is a **CompanionEngine-only** method — do **not** add
  it to the `AlgorithmEngine` interface in `program.ts`.
- No personas, no `generationBias`, no device/LLM/panel wiring, no Player arming
  (all later phases).
- Tests are colocated `*.test.ts`, node environment, import from
  `@jest/globals`; contract-style (generation is random — assert guarantees, not
  exact output).
- Zero-warning outfit: finish with `npm run typecheck`, `npm run lint`
  (`--max-warnings 0`), `npm test`, and `npm run build` all clean; run
  `npm run format` before finishing.
- **Commit policy (Companions exception):** unlike other work, this project's
  spec + plan docs **are** committed. Commit code/test/changelog as the tasks
  direct, and only when the tasks say so.

---

### Task 1: CompanionEngine — the ported motion (speed, valves, scale, finish)

Port Autopilot's generation into a new `CompanionEngine`, with the template
table already extended to carry a `label` per template (the label is authored
here as data; the narration overlay that reads it is Task 2).

**Files:**

- Create: `src/lib/algorithms/companion-engine.ts`
- Test: `src/lib/algorithms/companion-engine.test.ts`

**Interfaces:**

- Consumes: `AlgorithmEngine`, `SpeedEvent`, `ValveEvent`, `PlayerContext` from
  `@/lib/program`.
- Produces:
  - `type IntensityLevel = "warmup" | "low" | "medium" | "high"`
  - `type EdgeControlLevel = "gentle" | "moderate" | "intense"`
  - `type SuctionControlLevel = "off" | "little" | "more"`
  - `class CompanionEngine implements AlgorithmEngine` with constructor
    `(intensity: IntensityLevel, edgeControl: EdgeControlLevel, suctionControl: SuctionControlLevel)`;
    methods `reset()`, `setIntensity(level)`, `setEdgeControl(level)`,
    `setSuctionControl(level)`, `beginFinish()`,
    `generateSpeed(from, until, ctx)`,
    `generateValves(speedEvents, from, until, ctx)`, `scale(event)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/algorithms/companion-engine.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import type { PlayerContext, SpeedEvent } from "../program";
import { CompanionEngine } from "./companion-engine";

// Contract tests (see program.ts): generation is random by design, so these pin
// the guarantees the Player relies on, not exact output.

const CTX: PlayerContext = { clock: 0, currentSpeed: 0, currentRawSpeed: 0 };

describe("CompanionEngine.generateSpeed", () => {
  it("always extends past fromTime, sorted, in pattern space", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    let from = 0;
    // Walk several look-ahead batches the way the Player does.
    for (let i = 0; i < 10; i++) {
      const until = from + 60_000;
      const events = engine.generateSpeed(from, until, CTX);
      expect(events.length).toBeGreaterThan(0);

      let lastAt = from;
      for (const event of events) {
        expect(event.at).toBeGreaterThanOrEqual(lastAt);
        lastAt = event.at;
        expect(event.speed).toBeGreaterThanOrEqual(0);
        expect(event.speed).toBeLessThanOrEqual(100);
      }
      // A batch ending at or before fromTime would spin the Player's loop.
      expect(lastAt).toBeGreaterThan(from);
      from = lastAt;
    }
  });

  it("emits the finish ramp once (unscaled) then parks", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.beginFinish();
    const ramp = engine.generateSpeed(0, 60_000, CTX);
    expect(ramp.length).toBeGreaterThan(0);
    expect(ramp.every((e) => e.unscaled === true)).toBe(true);
    // Parked: nothing more until something changes.
    expect(engine.generateSpeed(60_000, 120_000, CTX)).toEqual([]);
  });

  it("resumes generating after reset() clears a finish", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.beginFinish();
    engine.generateSpeed(0, 60_000, CTX);
    engine.reset();
    expect(engine.generateSpeed(0, 60_000, CTX).length).toBeGreaterThan(0);
  });
});

describe("CompanionEngine.generateValves", () => {
  it("emits no valves when suction is off", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    const speed = engine.generateSpeed(0, 60_000, CTX);
    expect(engine.generateValves(speed, 0, 60_000, CTX)).toEqual([]);
  });

  it("pulses stroke-minus on moves when suction is on, respecting the interval", () => {
    const engine = new CompanionEngine("high", "moderate", "more");
    const speed = engine.generateSpeed(0, 60_000, CTX);
    const valves = engine.generateValves(speed, 0, 60_000, CTX);
    expect(valves.length).toBeGreaterThan(0);
    // Every valve action is on the minus (stroke) valve.
    expect(valves.every((v) => v.valve === "minus")).toBe(true);
    // Pulses are open/close pairs.
    const opens = valves.filter((v) => v.open);
    const closes = valves.filter((v) => !v.open);
    expect(opens.length).toBe(closes.length);
    // Consecutive opens are at least the "more" interval (2000 ms) apart.
    const openTimes = opens.map((v) => v.at);
    for (let i = 1; i < openTimes.length; i++) {
      expect(openTimes[i]! - openTimes[i - 1]!).toBeGreaterThanOrEqual(2000);
    }
  });

  it("closes both valves during finish", () => {
    const engine = new CompanionEngine("medium", "moderate", "more");
    engine.beginFinish();
    expect(engine.generateValves([], 0, 60_000, CTX)).toEqual([
      { kind: "valve", at: 0, valve: "minus", open: false },
      { kind: "valve", at: 0, valve: "plus", open: false },
    ]);
  });
});

describe("CompanionEngine.scale", () => {
  it("passes speed through unchanged (no magnitude knob)", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    const event: SpeedEvent = { kind: "speed", at: 0, speed: 73 };
    expect(engine.scale(event)).toBe(73);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/algorithms/companion-engine.test.ts` Expected: FAIL —
`Cannot find module './companion-engine'`.

- [ ] **Step 3: Write the engine (ported motion + labelled template table)**

Create `src/lib/algorithms/companion-engine.ts`:

```ts
// CompanionEngine — the motion backbone for the Companions algorithm. A faithful,
// self-contained port of AutopilotEngine's generation (pattern templates,
// constants, block builder, intensity/edge scaling, suction valves, finish),
// duplicated rather than imported because engines don't import each other (see
// ARCHITECTURE.md; Goon duplicates Groove for the same reason). The one addition
// over Autopilot is that each template carries a `label` — a neutral, present-
// tense description of what that mini-program does — which the narration overlay
// reads (see generateNarrationCues). Pure event generation/scaling: no React, no
// device, no LLM, no personas (those ride on top in a later phase).

import {
  type PlayerContext,
  type AlgorithmEngine,
  type SpeedEvent,
  type ValveEvent,
} from "@/lib/program";

export type IntensityLevel = "warmup" | "low" | "medium" | "high";
export type EdgeControlLevel = "gentle" | "moderate" | "intense";
export type SuctionControlLevel = "off" | "little" | "more";

interface TemplateStep {
  speed: number;
  duration: number;
}

// A pattern template plus its narration label. The label is neutral and
// persona-agnostic — the persona voices it in a later phase; here it is plain data.
interface LabelledTemplate {
  steps: TemplateStep[];
  label: string;
}

const SPEED_MAX = 100;
const SPEED_TEMPLATE_MIN = 5;
const FINISH_HOLD_MS = 1_800_000;
const TEMPLATES_PER_BLOCK = 10;
const BLOCK_LEAD_IN_SPEED = 10;

const LABELLED_TEMPLATES: LabelledTemplate[] = [
  {
    steps: [
      5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
      100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15,
      10, 5,
    ].map((s) => ({ speed: s, duration: 5000 })),
    label: "a long, slow sweep all the way up and back down",
  },
  {
    steps: [
      5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5,
    ].map((s) => ({ speed: s, duration: 7000 })),
    label: "a gentle, shallow build and ebb",
  },
  {
    steps: [
      { speed: 50, duration: 10000 },
      { speed: 100, duration: 7000 },
      { speed: 10, duration: 10000 },
      { speed: 50, duration: 10000 },
      { speed: 100, duration: 7000 },
      { speed: 10, duration: 10000 },
      { speed: 50, duration: 10000 },
      { speed: 100, duration: 7000 },
      { speed: 10, duration: 10000 },
    ],
    label: "surging between a crawl and full pace",
  },
  {
    steps: [
      { speed: 10, duration: 10000 },
      { speed: 100, duration: 10000 },
      { speed: 10, duration: 10000 },
      { speed: 100, duration: 10000 },
      { speed: 10, duration: 10000 },
      { speed: 100, duration: 10000 },
      { speed: 10, duration: 10000 },
      { speed: 100, duration: 10000 },
    ],
    label: "slamming between dead slow and full tilt",
  },
  {
    steps: [
      { speed: 5, duration: 3000 },
      { speed: 50, duration: 10000 },
      { speed: 10, duration: 4000 },
      { speed: 60, duration: 10000 },
      { speed: 5, duration: 5000 },
      { speed: 70, duration: 10000 },
      { speed: 10, duration: 5000 },
      { speed: 80, duration: 10000 },
      { speed: 5, duration: 6000 },
      { speed: 90, duration: 10000 },
      { speed: 10, duration: 7000 },
      { speed: 100, duration: 10000 },
      { speed: 5, duration: 5000 },
    ],
    label: "teasing climbs, each one higher than the last",
  },
  {
    steps: [
      { speed: 5, duration: 3000 },
      { speed: 10, duration: 3000 },
      { speed: 15, duration: 3000 },
      { speed: 20, duration: 3000 },
      { speed: 15, duration: 3000 },
      { speed: 10, duration: 3000 },
      { speed: 5, duration: 5000 },
      { speed: 10, duration: 5000 },
      { speed: 15, duration: 5000 },
      { speed: 20, duration: 5000 },
      { speed: 15, duration: 5000 },
      { speed: 10, duration: 5000 },
      { speed: 5, duration: 5000 },
    ],
    label: "tiny teasing waves down low",
  },
  {
    steps: [
      { speed: 20, duration: 5000 },
      { speed: 40, duration: 10000 },
      { speed: 100, duration: 10000 },
      { speed: 30, duration: 9000 },
      { speed: 100, duration: 10000 },
      { speed: 20, duration: 8000 },
      { speed: 100, duration: 10000 },
      { speed: 10, duration: 7000 },
      { speed: 100, duration: 10000 },
      { speed: 5, duration: 6000 },
      { speed: 100, duration: 10000 },
      { speed: 5, duration: 5000 },
      { speed: 100, duration: 10000 },
      { speed: 5, duration: 4000 },
      { speed: 100, duration: 8000 },
      { speed: 5, duration: 3000 },
      { speed: 100, duration: 7000 },
      { speed: 5, duration: 2000 },
      { speed: 100, duration: 6000 },
    ],
    label: "full-pace bursts with deeper and deeper plunges between",
  },
  {
    steps: [
      { speed: 20, duration: 2000 },
      { speed: 90, duration: 5000 },
      { speed: 100, duration: 5000 },
      { speed: 90, duration: 5000 },
      { speed: 80, duration: 5000 },
    ],
    label: "a quick rise into a hold near the top",
  },
];

const intensityRanges: Record<IntensityLevel, { min: number; max: number }> = {
  warmup: { min: 5, max: 20 },
  low: { min: 5, max: 30 },
  medium: { min: 15, max: 70 },
  high: { min: 30, max: 100 },
};

const edgeControlParams: Record<
  EdgeControlLevel,
  { plateauTime: number; cooldownTime: number }
> = {
  gentle: { plateauTime: 0.5, cooldownTime: 2 },
  moderate: { plateauTime: 1, cooldownTime: 1 },
  intense: { plateauTime: 1.5, cooldownTime: 0.5 },
};

const suctionControlParams: Record<
  SuctionControlLevel,
  {
    enabled: boolean;
    baseDuration: number;
    speedMultiplier: number;
    interval: number;
  }
> = {
  off: { enabled: false, baseDuration: 0, speedMultiplier: 0, interval: 0 },
  little: {
    enabled: true,
    baseDuration: 200,
    speedMultiplier: 0.8,
    interval: 3000,
  },
  more: {
    enabled: true,
    baseDuration: 400,
    speedMultiplier: 0.6,
    interval: 2000,
  },
};

function scaleSpeedToIntensity(speed: number, level: IntensityLevel): number {
  const { min, max } = intensityRanges[level];
  const norm = (speed - SPEED_TEMPLATE_MIN) / (SPEED_MAX - SPEED_TEMPLATE_MIN);
  const scaled = Math.round(min + norm * (max - min));
  return Math.max(min, Math.min(max, scaled));
}

function scaleDurationToEdge(
  templateSpeed: number,
  duration: number,
  edge: EdgeControlLevel,
): number {
  const p = edgeControlParams[edge];
  if (templateSpeed > 70) return Math.round(duration * p.plateauTime);
  if (templateSpeed < 30) return Math.round(duration * p.cooldownTime);
  return duration;
}

function applyPlateauJitter(speed: number, edge: EdgeControlLevel): number {
  if (edge === "intense" && speed > 70) {
    const headroom = Math.min(SPEED_MAX - speed, 15);
    return speed + Math.round(headroom * Math.random());
  }
  if (edge === "gentle" && speed > 70) {
    const excess = Math.min(speed - 50, 20);
    return speed - Math.round(excess * 0.5);
  }
  return speed;
}

// One block: TEMPLATES_PER_BLOCK randomly-chosen templates concatenated behind a
// lead-in event, each step scaled by intensity/edge. Returns the events plus the
// time the block ends, so successive blocks chain back to back. (The narration
// segments this also produces are added in a later task.)
function buildBlock(
  startAt: number,
  intensity: IntensityLevel,
  edge: EdgeControlLevel,
): { events: SpeedEvent[]; endAt: number } {
  const events: SpeedEvent[] = [
    { kind: "speed", at: startAt, speed: BLOCK_LEAD_IN_SPEED },
  ];
  let at = startAt;
  for (let i = 0; i < TEMPLATES_PER_BLOCK; i++) {
    const template =
      LABELLED_TEMPLATES[Math.floor(Math.random() * LABELLED_TEMPLATES.length)];
    if (template === undefined) continue;
    for (const step of template.steps) {
      const scaled = scaleSpeedToIntensity(step.speed, intensity);
      const speed = applyPlateauJitter(scaled, edge);
      const duration = scaleDurationToEdge(step.speed, step.duration, edge);
      at += duration;
      events.push({ kind: "speed", at, speed });
    }
  }
  return { events, endAt: at };
}

export class CompanionEngine implements AlgorithmEngine {
  private intensityLevel: IntensityLevel;
  private edgeControlLevel: EdgeControlLevel;
  private suctionControlLevel: SuctionControlLevel;
  private finishing = false;
  private finishEmitted = false;

  constructor(
    intensity: IntensityLevel,
    edgeControl: EdgeControlLevel,
    suctionControl: SuctionControlLevel,
  ) {
    this.intensityLevel = intensity;
    this.edgeControlLevel = edgeControl;
    this.suctionControlLevel = suctionControl;
  }

  reset(): void {
    this.finishing = false;
    this.finishEmitted = false;
  }

  setIntensity(level: IntensityLevel): void {
    this.intensityLevel = level;
  }

  setEdgeControl(level: EdgeControlLevel): void {
    this.edgeControlLevel = level;
  }

  setSuctionControl(level: SuctionControlLevel): void {
    this.suctionControlLevel = level;
  }

  beginFinish(): void {
    this.finishing = true;
    this.finishEmitted = false;
    this.intensityLevel = "high";
    this.edgeControlLevel = "moderate";
    this.suctionControlLevel = "off";
  }

  generateSpeed(
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): SpeedEvent[] {
    if (this.finishing) {
      if (this.finishEmitted) return [];
      this.finishEmitted = true;
      return [
        { kind: "speed", at: fromTime, speed: SPEED_MAX, unscaled: true },
        {
          kind: "speed",
          at: fromTime + FINISH_HOLD_MS,
          speed: 0,
          unscaled: true,
        },
      ];
    }

    const events: SpeedEvent[] = [];
    let at = fromTime;
    while (at < untilTime) {
      const block = buildBlock(at, this.intensityLevel, this.edgeControlLevel);
      events.push(...block.events);
      at = block.endAt;
    }
    return events;
  }

  // Vacuum maintenance, faithful to Autopilot's handleSuctionControl: a
  // stroke-minus pulse fires only when a speed move is sent (a step transition —
  // never mid-step), and only if at least `interval` has passed since the last
  // pulse. The interval is a minimum gap between pulses, not a cadence. Each
  // pulse's length is keyed to that move's speed (slow strokes get long pulses).
  // Finish closes both valves.
  generateValves(
    speedEvents: SpeedEvent[],
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): ValveEvent[] {
    if (this.finishing) {
      return [
        { kind: "valve", at: fromTime, valve: "minus", open: false },
        { kind: "valve", at: fromTime, valve: "plus", open: false },
      ];
    }

    const p = suctionControlParams[this.suctionControlLevel];
    if (!p.enabled) return [];

    // The gate starts closed at session start (lastSuctionTime starts at 0, so
    // nothing fires before `interval`) but OPEN on a mid-session (re-)lay, so the
    // very next move pulses.
    let lastPulse = fromTime === 0 ? 0 : Number.NEGATIVE_INFINITY;
    const valves: ValveEvent[] = [];
    for (const ev of speedEvents) {
      if (ev.at < fromTime || ev.at >= untilTime) continue;
      if (ev.at - lastPulse < p.interval) continue;
      const pulseMs = Math.round(
        (p.baseDuration * p.speedMultiplier) / (ev.speed / SPEED_MAX + 0.1),
      );
      valves.push({ kind: "valve", at: ev.at, valve: "minus", open: true });
      valves.push({
        kind: "valve",
        at: ev.at + pulseMs,
        valve: "minus",
        open: false,
      });
      lastPulse = ev.at;
    }
    return valves;
  }

  scale(event: SpeedEvent): number {
    return event.speed;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/algorithms/companion-engine.test.ts` Expected: PASS
(all `generateSpeed` / `generateValves` / `scale` tests).

- [ ] **Step 5: Verify typecheck and lint are clean**

Run: `npm run typecheck && npm run lint` Expected: no output. (The `label` field
is present but not yet read — that is fine; object-literal properties are never
flagged as unused. Task 2 reads it.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/algorithms/companion-engine.ts src/lib/algorithms/companion-engine.test.ts
git commit -m "Companions: CompanionEngine — port Autopilot's template-block motion"
```

---

### Task 2: Narration overlay — segments + `generateNarrationCues`

Record a narration segment at each template boundary as speed is generated, and
expose them windowed through a new CompanionEngine-only method.

**Files:**

- Modify: `src/lib/algorithms/companion-engine.ts`
- Modify: `src/lib/algorithms/companion-engine.test.ts` (add a narration
  `describe` block)

**Interfaces:**

- Consumes: the Task 1 `CompanionEngine`.
- Produces:
  - `interface NarrationCue { at: number; text: string }` (exported).
  - `CompanionEngine.generateNarrationCues(fromTime: number, untilTime: number): NarrationCue[]`
    — one cue per template boundary in `[fromTime, untilTime)`, sorted
    non-decreasing by `at`, `text` = that template's label; a single finish cue
    while finishing. **Not** on the `AlgorithmEngine` interface.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/algorithms/companion-engine.test.ts` (below the existing
`describe` blocks):

```ts
describe("CompanionEngine.generateNarrationCues", () => {
  it("fires cues on real template boundaries, labelled and in-window", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    const speed = engine.generateSpeed(0, 120_000, CTX);
    const cues = engine.generateNarrationCues(0, 120_000);
    expect(cues.length).toBeGreaterThan(1); // several across the window

    const speedTimes = new Set(speed.map((e) => e.at));
    let lastAt = -1;
    for (const cue of cues) {
      // A cue always lands on a real boundary — i.e. a generated speed-event time.
      expect(speedTimes.has(cue.at)).toBe(true);
      expect(cue.text.length).toBeGreaterThan(0); // labelled
      expect(cue.at).toBeGreaterThanOrEqual(lastAt); // sorted
      lastAt = cue.at;
      expect(cue.at).toBeGreaterThanOrEqual(0);
      expect(cue.at).toBeLessThan(120_000);
    }
  });

  it("draws every label from a small fixed set (the template table)", () => {
    const engine = new CompanionEngine("high", "intense", "off");
    engine.generateSpeed(0, 300_000, CTX);
    const cues = engine.generateNarrationCues(0, 300_000);
    const distinct = new Set(cues.map((c) => c.text));
    // Eight templates → at most eight distinct labels, all non-empty.
    expect(distinct.size).toBeLessThanOrEqual(8);
    for (const label of distinct) expect(label.length).toBeGreaterThan(0);
  });

  it("windows cues to [from, until)", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.generateSpeed(0, 180_000, CTX);
    const all = engine.generateNarrationCues(0, 180_000);
    const tail = engine.generateNarrationCues(60_000, 180_000);
    expect(tail.every((c) => c.at >= 60_000 && c.at < 180_000)).toBe(true);
    expect(tail.length).toBeLessThan(all.length);
  });

  it("emits a single finish cue while finishing", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.beginFinish();
    const cues = engine.generateNarrationCues(0, 60_000);
    expect(cues.length).toBe(1);
    expect(cues[0]!.text.length).toBeGreaterThan(0);
    expect(cues[0]!.at).toBe(0);
  });

  it("clears cues on reset()", () => {
    const engine = new CompanionEngine("medium", "moderate", "off");
    engine.generateSpeed(0, 120_000, CTX);
    expect(engine.generateNarrationCues(0, 120_000).length).toBeGreaterThan(0);
    engine.reset();
    expect(engine.generateNarrationCues(0, 120_000)).toEqual([]);
  });
});
```

Also add `NarrationCue` to the existing import from `./companion-engine` at the
top of the test file only if you assert its type directly — you don't here, so
no import change is needed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/algorithms/companion-engine.test.ts` Expected: FAIL —
`engine.generateNarrationCues is not a function` (and a type error under
`--noEmit`).

- [ ] **Step 3: Add the `NarrationCue` type**

In `src/lib/algorithms/companion-engine.ts`, just below the three level-type
exports, add:

```ts
// A narration cue: the program switches to a new mini-program at `at`, described
// by `text` (a neutral, persona-agnostic label). The persona voices it in a later
// phase; here it is plain data. Not part of the AlgorithmEngine contract — the Player
// doesn't consume cues until a later phase.
export interface NarrationCue {
  at: number;
  text: string;
}
```

- [ ] **Step 4: Record segments in `buildBlock`**

Replace the `buildBlock` function (and its return-type comment) in
`src/lib/algorithms/companion-engine.ts` with the version that also collects a
segment at each template's boundary:

```ts
// One block: TEMPLATES_PER_BLOCK randomly-chosen templates concatenated behind a
// lead-in event, each step scaled by intensity/edge. Returns the events, the
// narration segments (one per template, at the boundary where that template
// begins — always coincident with a real speed-event time), and the time the
// block ends so successive blocks chain back to back.
function buildBlock(
  startAt: number,
  intensity: IntensityLevel,
  edge: EdgeControlLevel,
): { events: SpeedEvent[]; segments: NarrationCue[]; endAt: number } {
  const events: SpeedEvent[] = [
    { kind: "speed", at: startAt, speed: BLOCK_LEAD_IN_SPEED },
  ];
  const segments: NarrationCue[] = [];
  let at = startAt;
  for (let i = 0; i < TEMPLATES_PER_BLOCK; i++) {
    const template =
      LABELLED_TEMPLATES[Math.floor(Math.random() * LABELLED_TEMPLATES.length)];
    if (template === undefined) continue;
    // The boundary is the current cursor — the moment before this template's
    // first step, coincident with the previous event's time (or the lead-in).
    segments.push({ at, text: template.label });
    for (const step of template.steps) {
      const scaled = scaleSpeedToIntensity(step.speed, intensity);
      const speed = applyPlateauJitter(scaled, edge);
      const duration = scaleDurationToEdge(step.speed, step.duration, edge);
      at += duration;
      events.push({ kind: "speed", at, speed });
    }
  }
  return { events, segments, endAt: at };
}
```

- [ ] **Step 5: Accumulate segments in `generateSpeed`, clear them in `reset`,
      add the finish-cue label and the method**

In `src/lib/algorithms/companion-engine.ts`:

a) Add a finish-cue label constant next to the other constants (e.g. below
`BLOCK_LEAD_IN_SPEED`):

```ts
const FINISH_CUE_LABEL = "the finish — full and relentless";
```

b) Add a private segment buffer to the class (below `finishEmitted`):

```ts
  // Narration segments recorded as speed is generated — one per template
  // boundary. generateNarrationCues reads these; reset() clears them.
  private narrationSegments: NarrationCue[] = [];
```

c) In `reset()`, clear the buffer too:

```ts
  reset(): void {
    this.finishing = false;
    this.finishEmitted = false;
    this.narrationSegments = [];
  }
```

d) In `generateSpeed`, in the block-tiling loop, push the block's segments as
they are built (finish path is unchanged — it records no segments):

```ts
const events: SpeedEvent[] = [];
let at = fromTime;
while (at < untilTime) {
  const block = buildBlock(at, this.intensityLevel, this.edgeControlLevel);
  events.push(...block.events);
  this.narrationSegments.push(...block.segments);
  at = block.endAt;
}
return events;
```

e) Add the method (place it after `generateValves`, before `scale`):

```ts
  // Narration overlay: one cue per template boundary in [fromTime, untilTime),
  // read from the segments recorded as speed was generated (template choice is
  // random inside generation, so cues can't be re-derived from speed events).
  // While finishing, a single finish cue. CompanionEngine-only — not on the
  // AlgorithmEngine contract; the Player consumes cues in a later phase.
  generateNarrationCues(fromTime: number, untilTime: number): NarrationCue[] {
    if (this.finishing) {
      return [{ at: fromTime, text: FINISH_CUE_LABEL }];
    }
    return this.narrationSegments
      .filter((s) => s.at >= fromTime && s.at < untilTime)
      .map((s) => ({ at: s.at, text: s.text }));
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/lib/algorithms/companion-engine.test.ts` Expected: PASS
(all `generateSpeed` / `generateValves` / `scale` / `generateNarrationCues`
tests).

- [ ] **Step 7: Verify typecheck and lint are clean**

Run: `npm run typecheck && npm run lint` Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/lib/algorithms/companion-engine.ts src/lib/algorithms/companion-engine.test.ts
git commit -m "Companions: narration overlay — a cue at every template boundary"
```

---

### Task 3: Full-phase verification, changelog, PR

**Files:**

- Modify: `CHANGELOG.md`

- [ ] **Step 1: Format, then run every gate**

Run: `npm run format` Then:
`npm run typecheck && npm run lint && npm test && npm run build` Expected: all
clean. If `format` changed files, stage them for the changelog commit below.

- [ ] **Step 2: Update the changelog**

In `CHANGELOG.md`, add today's date heading `## 2026-07-20` at the very top
**only if it is not already present** (if the top heading is an earlier date,
add this new heading above it; if today's heading already exists, add the line
under it in feature→enhancement→bug→internal order — this is the only line so
far, an `internal`):

```markdown
- internal: **CompanionEngine + narration overlay** — a self-contained port of
  Autopilot's template-block generation, plus a narration overlay that emits a
  cue at each template boundary describing the mini-program starting there.
  Engine only; not yet wired to device, LLM or panel.
  ([#13](https://github.com/autogoon/autogoon/pull/13))
```

- [ ] **Step 3: Commit the changelog (and any formatting changes)**

```bash
git add CHANGELOG.md
git commit -m "Companions: changelog for CompanionEngine + narration overlay"
```

If `npm run format` changed other files in Step 1, commit those too:

```bash
git add -A
git commit -m "Companions: formatting"
```

- [ ] **Step 4: Update the draft PR #13 description**

This phase lands on the existing `companions` branch / draft PR #13. In the PR
description's phase roadmap, tick **Phase 3 — CompanionEngine + narration
overlay** and flesh out its bullet (per the per-phase PR convention). **Do not
merge** — the whole feature merges together after Phase 12.

- [ ] **Step 5: Manual acceptance (unit-level — no device/LLM/app)**

Run: `npm test -- src/lib/algorithms/companion-engine.test.ts` Confirm the
narration tests demonstrate the deliverable: cues land on template boundaries,
every cue is labelled from the fixed table, cues window correctly, finish yields
a single cue, and `reset()` clears them.
