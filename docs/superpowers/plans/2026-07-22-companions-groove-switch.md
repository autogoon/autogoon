# Companions: Switch the Program from Autopilot to Groove — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-base the Companions device program on Groove instead of Autopilot —
a Groove-style dip program the companion drives through retooled speed/variety
knobs — and update all Companions documentation to match, including reconciling
the design doc with what actually shipped.

**Architecture:** `CompanionEngine` becomes a self-contained port of
`GrooveEngine` (the `PEAK → floor → PEAK` dip pattern with Speed% +
timing-Variability + dip-Variability knobs) plus one companion-only touch: the
one-shot stroke-minus tease at session start. The Autopilot template blocks, the
edge/suction knobs, the boundary-based `generateNarrationCues` overlay, and the
`beginFinish` model all go. The companion's LLM tools are retooled from
Autopilot levels (`intensity` warmup/low/medium/high, `edge_control`, vacuum) to
Groove's knobs: a **live** `intensity` percent (applied in `scale()`, sent via
`device.refresh()`) and a `variety` level that drives both variability knobs
(via `device.invalidateFuture()`). Elise's prompt is rewritten to narrate speed
changes naturally while carrying a percent. Docs are then reconciled with
shipped reality and re-pointed at the Groove direction, and the stale per-phase
specs/plans are deleted.

**Tech Stack:** TypeScript, Next.js (App Router, RSC), React, Jest
(`@jest/globals`, node env), Tailwind. No new dependencies.

## Global Constraints

- **Zero warnings.** `npm run lint` runs `--max-warnings 0`; the repo is kept at
  zero. Fix every lint/typecheck warning before finishing, including ones not
  caused by your change. Gate on both `npm run lint` and `npm run typecheck`
  producing no output.
- **Gates before done:** `npm run typecheck`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run format`. If `format` changes files, keep those
  changes.
- **TDD** for the engine (the only unit-tested layer here): failing test → run
  it red → minimal implementation → run it green. Panels/prompt/docs are not
  unit-tested — verify them with typecheck/lint/build; leave hardware/browser
  confirmation to the user (no ad-hoc browser-driving).
- **Engines never import each other** (ARCHITECTURE.md). `CompanionEngine`
  duplicates Groove's generation rather than importing it — exactly as it
  currently duplicates Autopilot, and as Goon duplicates Groove.
- **Terse UI/prompt copy** — short and blunt; no flowery framing.
- **Changelog** (CHANGELOG.md): one line per change, newest first, grouped under
  the landing date `## YYYY-MM-DD`, ordered feature → enhancement → bug →
  internal within a day. Bold commit-style summary:
  `- tag: **Summary** — description`. Link the PR
  `([#N](https://github.com/autogoon/autogoon/pull/N))`. Only tag `bug` if it
  shipped on `main`.
- **Never commit specs or plans** — this plan and the design doc live on disk;
  the design doc is committed as project documentation, but implementation plans
  under `docs/superpowers/plans/` are left uncommitted.
- **Commits are gated on the user.** Committing/pushing/merging are separate
  actions; only do each when explicitly asked. Work continues on the existing
  `companions-2` branch.
- **Algorithm docs are experiential** except reverse-engineered ones
  (Autopilot). Not relevant to files here, but keep in mind if touching
  `ALGORITHM-*.md`.

---

## File map

| File                                                                                                                                                        | Change      | Responsibility after                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `src/lib/algorithms/companion-engine.ts`                                                                                                                    | **Rewrite** | Groove-style dip engine + start tease. No templates, edge, suction, narration cues, or `beginFinish`.  |
| `src/lib/algorithms/companion-engine.test.ts`                                                                                                               | **Rewrite** | Contract tests for the Groove-shaped engine.                                                           |
| `src/components/algorithms/companions-panel.tsx`                                                                                                            | **Modify**  | Retooled `intensity` (percent, live) + `variety` (level) tools + on-screen controls; drop edge/vacuum. |
| `src/lib/companions/elise-prompt.ts`                                                                                                                        | **Modify**  | CONTROL/INTIMACY rewritten for Groove knobs; TOY STATUS wording updated.                               |
| `COMPANIONS.md`                                                                                                                                             | **Modify**  | Device-control section describes the new tools.                                                        |
| `docs/superpowers/specs/2026-07-18-companions-design.md`                                                                                                    | **Modify**  | Reconciled with shipped reality; forward direction re-pointed at Groove + ambient-chat merge.          |
| `CHANGELOG.md`                                                                                                                                              | **Modify**  | Entry for the Groove switch.                                                                           |
| `docs/superpowers/specs/2026-07-18-companions-phase-{1,2,3}-*.md`, `2026-07-20-companions-phase-{4,5}-design.md`, `2026-07-21-companions-phase-6-design.md` | **Delete**  | (stale)                                                                                                |
| `docs/superpowers/plans/2026-07-18-companions-phase-{1,2,3}-*.md`, `2026-07-20-companions-phase-4.md`, `2026-07-21-companions-phase-{5,6}-*.md`             | **Delete**  | (stale)                                                                                                |

---

## Task 1: Re-engine `CompanionEngine` to Groove

**Files:**

- Rewrite: `src/lib/algorithms/companion-engine.ts`
- Rewrite test: `src/lib/algorithms/companion-engine.test.ts`

**Interfaces:**

- Produces (consumed by Task 2):
  - `export type VariabilityLevel = "off" | "low" | "medium" | "high"`
  - `new CompanionEngine(speedPercent: number, variability: VariabilityLevel, dip: VariabilityLevel)`
  - `setSpeedPercent(percent: number): void` — magnitude knob, live via
    `scale()`
  - `setVariability(level: VariabilityLevel): void` — shape knob
  - `setDipVariability(level: VariabilityLevel): void` — shape knob
  - `beginCumming(): void` — wind-down send-off
  - `reset(): void`
  - Implements `AlgorithmEngine` (`generateSpeed`, `generateValves`, `scale`).
- Removed (Task 2 must stop importing/using these): `IntensityLevel`,
  `EdgeControlLevel`, `SuctionControlLevel`, `setIntensity`, `setEdgeControl`,
  `setSuctionControl`, `beginFinish`, `generateNarrationCues`, `NarrationCue`.

- [ ] **Step 1: Write the failing tests** — replace the entire contents of
      `src/lib/algorithms/companion-engine.test.ts` with:

```ts
import { describe, expect, it } from '@jest/globals';
import type { PlayerContext, SpeedEvent } from '../program';
import { CompanionEngine } from './companion-engine';

// Contract tests (see program.ts): generation is random by design, so these pin
// the guarantees the Player relies on, not exact output.

const CTX: PlayerContext = { clock: 0, currentSpeed: 0, currentRawSpeed: 0 };

describe('CompanionEngine.generateSpeed', () => {
  it('always extends past fromTime, sorted, in pattern space', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    let from = 0;
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
      expect(lastAt).toBeGreaterThan(from);
      from = lastAt;
    }
  });

  it('emits the cumming wind-down once (unscaled) then parks', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.beginCumming();
    const ramp = engine.generateSpeed(0, 60_000, CTX);
    expect(ramp.length).toBeGreaterThan(0);
    expect(ramp.every((e) => e.unscaled === true)).toBe(true);
    expect(engine.generateSpeed(60_000, 120_000, CTX)).toEqual([]);
  });

  it('resumes generating after reset() clears a cumming', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.beginCumming();
    engine.generateSpeed(0, 60_000, CTX);
    engine.reset();
    expect(engine.generateSpeed(0, 60_000, CTX).length).toBeGreaterThan(0);
  });

  it("resumes from the device's current speed after a knob change", () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.setVariability('high');
    const ctx: PlayerContext = {
      clock: 0,
      currentSpeed: 0,
      currentRawSpeed: 37,
    };
    const events = engine.generateSpeed(0, 60_000, ctx);
    expect(events[0]!.speed).toBe(37);
  });
});

describe('CompanionEngine.generateValves', () => {
  it('emits only the start stroke-minus tease on the window covering start', () => {
    const engine = new CompanionEngine(20, 'low', 'low');
    const speed = engine.generateSpeed(0, 60_000, CTX);
    expect(engine.generateValves(speed, 0, 60_000, CTX)).toEqual([
      { kind: 'valve', at: 0, valve: 'minus', open: true },
      { kind: 'valve', at: 10_000, valve: 'minus', open: false },
    ]);
  });

  it('emits nothing on a mid-session window', () => {
    const engine = new CompanionEngine(20, 'low', 'low');
    expect(engine.generateValves([], 60_000, 120_000, CTX)).toEqual([]);
  });

  it('emits the one-shot suction pulse riding the cumming wind-down', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    engine.beginCumming();
    expect(engine.generateValves([], 0, 60_000, CTX)).toEqual([
      { kind: 'valve', at: 3000, valve: 'minus', open: true },
      { kind: 'valve', at: 12000, valve: 'minus', open: false },
    ]);
  });
});

describe('CompanionEngine.scale', () => {
  it('scales raw speed by the live speed percent', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    const event: SpeedEvent = { kind: 'speed', at: 0, speed: 60 };
    expect(engine.scale(event, CTX)).toBe(30);
    engine.setSpeedPercent(100);
    expect(engine.scale(event, CTX)).toBe(60);
  });

  it('passes unscaled events through untouched', () => {
    const engine = new CompanionEngine(50, 'medium', 'medium');
    const event: SpeedEvent = {
      kind: 'speed',
      at: 0,
      speed: 25,
      unscaled: true,
    };
    expect(engine.scale(event, CTX)).toBe(25);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- companion-engine` Expected: FAIL — the current engine has no
`setSpeedPercent`/`beginCumming`, its constructor takes level strings, and
`scale` passes through unchanged.

- [ ] **Step 3: Rewrite the engine** — replace the entire contents of
      `src/lib/algorithms/companion-engine.ts` with:

```ts
// CompanionEngine — the motion backbone for the Companions algorithm. A faithful,
// self-contained port of GrooveEngine's dip generation (PEAK -> floor -> PEAK,
// with a live Speed% magnitude knob and timing/dip Variability shape knobs),
// duplicated rather than imported because engines don't import each other (see
// ARCHITECTURE.md; Goon duplicates Groove for the same reason). One companion-only
// addition over Groove: a one-shot stroke-minus tease held at session start
// (ported from Goon's STROKE_MINUS_APPLY_MS). Everything Autopilot-shaped is gone
// — the template blocks, edge/suction knobs, and the boundary-based narration
// overlay. The chattiness-paced ambient-chat cues are a later phase (Phase 7),
// generated here once a chattiness knob and an orchestrator consumer exist; there
// is no narration overlay in the meantime. Pure event generation/scaling: no
// React, no device, no LLM, no personas.

import {
  type PlayerContext,
  type AlgorithmEngine,
  type SpeedEvent,
  type ValveEvent,
} from '@/lib/program';

export type VariabilityLevel = 'off' | 'low' | 'medium' | 'high';

// How much a leg's duration can be randomly shortened, per level.
const TIMING_PERCENT: Record<VariabilityLevel, number> = {
  off: 0,
  low: 25,
  medium: 50,
  high: 75,
};
// The standard dip: every dip bottoms out at least this low. With dip
// variability off, it is exactly where every dip lands.
const STANDARD_FLOOR = 60;
// How deep a dip may go, per level. The floor is drawn between the level's
// minimum and STANDARD_FLOOR, so a higher level only ever adds depth.
const DIP_FLOOR: Record<VariabilityLevel, number> = {
  off: STANDARD_FLOOR,
  low: 40,
  medium: 20,
  high: 0,
};
// Skews the drawn floor toward the deep end. 1 is flat/uniform; above that deep
// dips get commoner. Endpoints don't move.
const DIP_SKEW = 2;
// A leg (PEAK -> floor, or floor -> PEAK) takes this long when variability is 0.
// Variability can only ever shorten it.
const BASELINE_LEG_MS = 10_000;
// Skews the random leg duration toward the short end.
const LEG_TIME_SKEW = 3;
// The device takes discrete speed commands, so a ramp is sampled into events —
// one send about this often.
const STEP_INTERVAL_MS = 1000;
// Speed steps within a leg are curved, not evenly spaced: interpolate in
// s^(1/RAMP_GAMMA) space and invert, so the ramp takes big strides near the top
// and fine ones near the bottom.
const RAMP_GAMMA = 2;
const PEAK_SPEED = 100;
const CUMMING_START_SPEED = 30;
const CUMMING_MID_SPEED = 20;
const CUMMING_END_SPEED = 5;
const CUMMING_STEP_MS = 500;
// One-shot stroke-minus tease held for this long at session start (ported from
// Goon's STROKE_MINUS_APPLY_MS). A teasing lead-in, independent of the dip
// pattern, re-derived per window so it only fires on the window covering start.
const STROKE_TEASE_MS = 10_000;

interface Ramp {
  waypoints: Array<{ speed: number; at: number }>;
  endAt: number;
}

// Every dip draws its own floor, between the level's deepest reach and the
// standard floor, skewed toward the deep end by DIP_SKEW. Off pins it to the
// standard floor; each level up only adds depth.
function drawFloor(dipLevel: VariabilityLevel): number {
  const deepest = DIP_FLOOR[dipLevel];
  const span = STANDARD_FLOOR - deepest;
  return Math.round(deepest + span * Math.pow(Math.random(), DIP_SKEW));
}

// One ramp of a dip. The leg gets a single random duration for its whole length,
// drawn from [BASELINE_LEG_MS * (1 - variability), BASELINE_LEG_MS], skewed
// toward the short end by LEG_TIME_SKEW. A deeper dip ramps steeper, not longer.
function buildLeg(
  from: number,
  to: number,
  variabilityPercent: number,
  startAt: number,
): Ramp {
  const variability = variabilityPercent / 100;
  const shortestMs = BASELINE_LEG_MS * (1 - variability);
  const legMs =
    shortestMs +
    (BASELINE_LEG_MS - shortestMs) * Math.pow(Math.random(), LEG_TIME_SKEW);
  const waypoints: Array<{ speed: number; at: number }> = [
    { speed: from, at: startAt },
  ];
  // A zero-length leg (from === to) still consumes its leg time, or the cycle
  // collapses to zero duration and the Player's look-ahead loop spins forever.
  if (from === to) return { waypoints, endAt: startAt + Math.round(legMs) };
  const steps = Math.max(1, Math.round(legMs / STEP_INTERVAL_MS));
  const stepMs = Math.max(1, Math.round(legMs / steps));
  const curvedFrom = Math.pow(from, 1 / RAMP_GAMMA);
  const curvedTo = Math.pow(to, 1 / RAMP_GAMMA);
  let at = startAt;
  for (let i = 1; i <= steps; i++) {
    at += stepMs;
    const curved = curvedFrom + ((curvedTo - curvedFrom) * i) / steps;
    waypoints.push({ speed: Math.round(Math.pow(curved, RAMP_GAMMA)), at });
  }
  return { waypoints, endAt: at };
}

function toSpeedEvents(
  waypoints: Array<{ speed: number; at: number }>,
): SpeedEvent[] {
  return waypoints.map((w) => ({ kind: 'speed', at: w.at, speed: w.speed }));
}

// One dip. The floor is drawn once here, not per leg, so the down-leg and the
// up-leg share the same bottom. `fromSpeed` lets a cycle that resumes after a
// knob change start from wherever the device already is rather than snapping to
// the peak first.
function buildFullCycle(
  dipLevel: VariabilityLevel,
  variabilityPercent: number,
  startAt: number,
  fromSpeed: number = PEAK_SPEED,
): { events: SpeedEvent[]; endAt: number } {
  const events: SpeedEvent[] = [];
  let at = startAt;
  const floor = drawFloor(dipLevel);
  for (const leg of [
    { from: fromSpeed, to: floor },
    { from: floor, to: PEAK_SPEED },
  ]) {
    const { waypoints, endAt } = buildLeg(
      leg.from,
      leg.to,
      variabilityPercent,
      at,
    );
    events.push(...toSpeedEvents(waypoints));
    at = endAt;
  }
  return { events, endAt: at };
}

// Intensity is a plain linear scale on the raw pattern, so a raw floor of 60 at
// intensity 10 lands on 6. Anything that shapes the dip belongs in the raw
// pattern, not here.
function scaleSpeed(raw: number, speedPercent: number): number {
  return Math.round((raw * speedPercent) / PEAK_SPEED);
}

export class CompanionEngine implements AlgorithmEngine {
  private speedPercent: number;
  private variabilityLevel: VariabilityLevel;
  private dipLevel: VariabilityLevel;
  // Set when a knob changes: the next dip picks up from the device's current
  // speed instead of snapping back to the peak.
  private startFromCurrent = false;
  private cumming = false;
  private cummingEmitted = false;

  constructor(
    speedPercent: number,
    variability: VariabilityLevel,
    dip: VariabilityLevel,
  ) {
    this.speedPercent = speedPercent;
    this.variabilityLevel = variability;
    this.dipLevel = dip;
  }

  private get variabilityPercent(): number {
    return TIMING_PERCENT[this.variabilityLevel];
  }

  reset(): void {
    this.startFromCurrent = false;
    this.cumming = false;
    this.cummingEmitted = false;
  }

  setSpeedPercent(percent: number): void {
    this.speedPercent = Math.max(0, Math.min(100, percent));
  }

  setVariability(level: VariabilityLevel): void {
    this.variabilityLevel = level;
    this.startFromCurrent = true;
  }

  setDipVariability(level: VariabilityLevel): void {
    this.dipLevel = level;
    this.startFromCurrent = true;
  }

  beginCumming(): void {
    this.cumming = true;
    this.cummingEmitted = false;
  }

  generateSpeed(
    fromTime: number,
    untilTime: number,
    ctx: PlayerContext,
  ): SpeedEvent[] {
    if (this.cumming) {
      if (this.cummingEmitted) return [];
      this.cummingEmitted = true;
      return this.cummingSpeed(fromTime);
    }
    const events: SpeedEvent[] = [];
    let at = fromTime;
    if (this.startFromCurrent) {
      this.startFromCurrent = false;
      const cycle = buildFullCycle(
        this.dipLevel,
        this.variabilityPercent,
        at,
        ctx.currentRawSpeed,
      );
      events.push(...cycle.events);
      at = cycle.endAt;
    }
    while (at < untilTime) {
      const cycle = buildFullCycle(this.dipLevel, this.variabilityPercent, at);
      events.push(...cycle.events);
      at = cycle.endAt;
    }
    return events;
  }

  // Valves: the one-shot stroke-minus tease over the window covering session
  // start, and the one-shot suction pulse that rides the cumming wind-down.
  // Both are pure functions of the window (no cadence state), so the Player can
  // re-lay the overlay.
  generateValves(
    _speedEvents: SpeedEvent[],
    fromTime: number,
    untilTime: number,
    _ctx: PlayerContext,
  ): ValveEvent[] {
    if (this.cumming) {
      return [
        { kind: 'valve', at: fromTime + 3000, valve: 'minus', open: true },
        { kind: 'valve', at: fromTime + 12000, valve: 'minus', open: false },
      ];
    }
    if (fromTime <= 0 && untilTime > 0) {
      return [
        { kind: 'valve', at: 0, valve: 'minus', open: true },
        { kind: 'valve', at: STROKE_TEASE_MS, valve: 'minus', open: false },
      ];
    }
    return [];
  }

  scale(event: SpeedEvent): number {
    if (event.unscaled === true) return event.speed;
    return scaleSpeed(event.speed, this.speedPercent);
  }

  private cummingSpeed(startAt: number): SpeedEvent[] {
    const events: SpeedEvent[] = [];
    let at = startAt;
    for (
      let speed = CUMMING_START_SPEED;
      speed >= CUMMING_MID_SPEED;
      speed -= 1.5
    ) {
      events.push({ kind: 'speed', at, speed, unscaled: true });
      at += CUMMING_STEP_MS;
    }
    for (let speed = CUMMING_MID_SPEED; speed >= CUMMING_END_SPEED; speed--) {
      events.push({ kind: 'speed', at, speed, unscaled: true });
      at += CUMMING_STEP_MS;
    }
    events.push({
      kind: 'speed',
      at: at + 1_800_000,
      speed: 0,
      unscaled: true,
    });
    return events;
  }
}
```

Note: `scale(event: SpeedEvent)` is a valid `AlgorithmEngine.scale`
implementation — the contract's `ctx` parameter is optional to consume (Groove's
`scale` also ignores it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- companion-engine` Expected: PASS (all describe blocks).

- [ ] **Step 5: Typecheck** (Task 2 hasn't run yet, so the panel still
      references removed symbols — that's expected and fixed in Task 2; do NOT
      commit yet)

Run: `npm run typecheck` Expected: errors only in
`src/components/algorithms/companions-panel.tsx` (removed
`IntensityLevel`/`setEdgeControl`/etc.). If errors appear anywhere else, fix
them here before moving on.

- [ ] **Step 6: Commit** (only with the user's go-ahead — see Global
      Constraints)

```bash
git add src/lib/algorithms/companion-engine.ts src/lib/algorithms/companion-engine.test.ts
git commit -m "Companions: re-base CompanionEngine on Groove's dip generation"
```

---

## Task 2: Retool the panel for Groove knobs

**Files:**

- Modify: `src/components/algorithms/companions-panel.tsx`

**Interfaces:**

- Consumes from Task 1: `CompanionEngine`, `VariabilityLevel`,
  `setSpeedPercent`, `setVariability`, `setDipVariability`.
- Tool surface produced (informs Task 3's prompt): `start`, `stop`,
  `intensity({ percent })`, `variety({ level })`.

The panel currently (lines ~40–52, 153–159, 187–208, 210–290, 297–314, 358–381,
549–609) wires Autopilot levels. Rework it as follows. Where a region isn't
spelled out here, leave it untouched.

- [ ] **Step 1: Update the engine import and defaults**

Replace the import block (currently lines ~40–45):

```tsx
import {
  CompanionEngine,
  type VariabilityLevel,
} from '@/lib/algorithms/companion-engine';
```

Replace the default-knob constants (currently lines ~47–52):

```tsx
// Fixed default knobs — the program is random within this baseline. Companions
// start gentle: a low-intensity, lightly-varying program. Elise turns it up from
// there via her intensity/variety tools. Speed is applied live; variety reshapes
// the dip pattern.
const DEFAULT_INTENSITY = 20;
const DEFAULT_VARIETY: VariabilityLevel = 'low';
```

- [ ] **Step 2: Update the engine construction** (currently lines ~153–159)

```tsx
const engineRef = useRef<CompanionEngine | null>(null);
engineRef.current ??= new CompanionEngine(
  DEFAULT_INTENSITY,
  DEFAULT_VARIETY,
  DEFAULT_VARIETY,
);
const engine = engineRef.current;
```

(`variety` drives both the timing-variability and dip knobs together — one
companion-facing "how much it varies/teases" control over Groove's two shape
knobs.)

- [ ] **Step 3: Replace the knob state + change callbacks** (currently lines
      ~187–208, the `intensity`/`edge` state and `changeIntensity`/`changeEdge`)

```tsx
// Program-shaping knobs, owned here. Declared above the tools / voice session
// because the intensity/variety tools below drive changeIntensity / changeVariety
// — one path for both her tool calls and the on-screen controls.
const [intensity, setIntensity] = useState<number>(DEFAULT_INTENSITY);
const [variety, setVariety] = useState<VariabilityLevel>(DEFAULT_VARIETY);

const changeIntensity = useCallback(
  (percent: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    setIntensity(clamped);
    engine.setSpeedPercent(clamped);
    // Magnitude knob: speed is applied in scale() every tick, so a live
    // refresh() re-sends at the new scale without regenerating the script.
    device.refresh();
    vacuglide.log(`intensity → ${clamped}%`);
  },
  [device, engine, vacuglide],
);
const changeVariety = useCallback(
  (level: VariabilityLevel) => {
    setVariety(level);
    // One companion knob over Groove's two shape knobs: how much the pace
    // varies and how deep it dips. Both reshape the generated pattern, so drop
    // the not-yet-played future and regenerate it.
    engine.setVariability(level);
    engine.setDipVariability(level);
    device.invalidateFuture();
    vacuglide.log(`variety → ${level}`);
  },
  [device, engine, vacuglide],
);
```

- [ ] **Step 4: Replace the tools array** (currently lines ~210–290 — keep
      `start`/`stop` as-is, replace `intensity`/`edge_control`)

```tsx
      {
        name: "intensity",
        description:
          "Set how hard and fast the toy drives him, as a percentage from 0 (off) to 100 (relentless). Call this to make it more or less intense; pass the percent you're going to. Read the current level from the toy status first, then move up or down from there. Narrate it however you like — 'faster', 'more intense' — but the tool is what actually changes it.",
        parameters: {
          type: "object",
          properties: {
            percent: {
              type: "integer",
              minimum: 0,
              maximum: 100,
              description: "0 = off, 100 = hardest/fastest",
            },
          },
          required: ["percent"],
        },
        run: (args) => {
          const percent = args.percent;
          if (typeof percent !== "number" || Number.isNaN(percent)) {
            return `invalid intensity: ${String(percent)}`;
          }
          changeIntensity(percent);
          return `intensity → ${Math.max(0, Math.min(100, Math.round(percent)))}%`;
        },
      },
      {
        name: "variety",
        description:
          "Set how much the toy varies and teases — how much it mixes up the pace and pulls back into long slow dips before climbing again, versus a steadier drive. Levels: off, low, medium, high. Call this to make it more teasing and restless, or calmer and steadier.",
        parameters: {
          type: "object",
          properties: {
            level: {
              type: "string",
              enum: ["off", "low", "medium", "high"],
              description: "off = steady drive, high = lots of teasing variation",
            },
          },
          required: ["level"],
        },
        run: (args) => {
          const level = args.level;
          if (
            level !== "off" &&
            level !== "low" &&
            level !== "medium" &&
            level !== "high"
          ) {
            return `invalid variety: ${String(level)}`;
          }
          changeVariety(level);
          return `variety → ${level}`;
        },
      },
```

Update the `tools` `useMemo` dependency array to
`[startProgram, stopProgram, changeIntensity, changeVariety]`.

- [ ] **Step 5: Update `getDeviceState`** (currently lines ~297–314)

```tsx
const getDeviceState = useCallback((): string => {
  const levels = `It's set to ${intensity}% intensity with ${variety} variety.`;
  if (!vacuglide.connected) {
    return `The toy is not connected and is not running. ${levels}`;
  }
  const running = player.source === engine && player.state === 'playing';
  const status = running
    ? 'The toy is connected and running.'
    : 'The toy is connected and not running.';
  return `${status} ${levels}`;
}, [
  vacuglide.connected,
  player.source,
  player.state,
  engine,
  intensity,
  variety,
]);
```

- [ ] **Step 6: Update `reset` and delete the suction callback** (currently
      lines ~358–381)

```tsx
const reset = useCallback(() => {
  setIntensity(DEFAULT_INTENSITY);
  engine.setSpeedPercent(DEFAULT_INTENSITY);
  setVariety(DEFAULT_VARIETY);
  engine.setVariability(DEFAULT_VARIETY);
  engine.setDipVariability(DEFAULT_VARIETY);
  device.arm(engine);
}, [device, engine]);
```

Delete the `changeSuction` callback entirely (the `suction` state, `setSuction`,
and `DEFAULT_SUCTION` go with it — remove all references).

- [ ] **Step 7: Replace the on-screen controls** (the Controls tab, currently
      lines ~569–608: the Intensity `Segmented`, Edge Control `Card`, and Vacuum
      Maintenance `Card`)

```tsx
              {/* On-screen program-shape controls. */}
              <Card title="Intensity">
                <div className="text-muted-foreground flex justify-between text-sm">
                  <span>Ceiling</span>
                  <span className="tabular-nums">{intensity}%</span>
                </div>
                <Slider
                  value={intensity}
                  min={0}
                  max={100}
                  step={5}
                  onChange={changeIntensity}
                />
              </Card>

              <Card title="Variety">
                <Segmented
                  options={[
                    { value: "off", label: "Off" },
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                  value={variety}
                  onChange={changeVariety}
                  activeClass="bg-purple-600 text-white"
                />
              </Card>
```

Add `Slider` to the imports (`import { Slider } from "@/components/slider";`)
alongside the existing component imports. Remove the now-unused `Segmented`
import only if no other `Segmented` remains (the Variety card still uses it, so
keep it).

- [ ] **Step 8: Sweep for stragglers**

Run:
`grep -n "suction\|Suction\|Vacuum\|edge\|Edge\|EdgeControl\|IntensityLevel\|SuctionControlLevel\|setSuctionControl\|setEdgeControl\|invalidateValves" src/components/algorithms/companions-panel.tsx`
Expected: no matches. Fix any that remain (the header comment at the top of the
file mentions "intensity/edge tools" and "no vacuum maintenance" — update that
prose too).

- [ ] **Step 9: Gates**

Run: `npm run typecheck` — Expected: clean. Run: `npm run lint` — Expected:
clean. Run: `npm run build` — Expected: succeeds.

- [ ] **Step 10: Commit** (only with the user's go-ahead)

```bash
git add src/components/algorithms/companions-panel.tsx
git commit -m "Companions: retool panel + tools for Groove intensity/variety knobs"
```

---

## Task 3: Rewrite Elise's system prompt for the Groove knobs

**Files:**

- Modify: `src/lib/companions/elise-prompt.ts`

**Interfaces:**

- Consumes from Task 2: the tool names/args `intensity({ percent })`,
  `variety({ level })`, and `start`/`stop`.
- The `{{TOY_STATUS}}` marker must stay (the voice session injects device state
  there — `use-voice-session.ts` line ~369).

- [ ] **Step 1: Rewrite the toy sentence in the INTIMACY section** — replace the
      bullet that begins "The user has a toy Elise can control. Its
      **intensity** has four levels…" with:

```
- The user has a toy Elise can control. Its **intensity** — how hard and fast it drives — runs from 0 to 100 percent, and she can set how much it **varies and teases** him (mixing up the pace, pulling back into long slow dips before climbing again) from off through low, medium, high. During intimate play Elise likes to take charge, announcing changes in plain language as part of teasing him — e.g. "mm, let's start you slow and see how you handle it," or "you've earned this — turning you up" — then actually setting the intensity higher or lower, or adding more teasing variation, to reward him, draw things out, or push him. She's a gamer and a streamer, so she's comfortable being a little technical about it if she feels like it ("let's take you to sixty") — but she never has to be; "faster," "harder," "easing you off" all work. There's no command syntax; she just says it in character and uses the tool.
```

- [ ] **Step 2: Rewrite the CONTROL section** — replace the whole `CONTROL:`
      block (currently lines ~36–42, ending at the `{{TOY_STATUS}}` line) with:

```
CONTROL:
- You control the toy through tools: start it, stop it, set its **intensity** (a percent from 0 to 100 — how hard and fast it drives), and set its **variety** (off / low / medium / high — how much it teases and mixes up the pace). Using the tool is the only thing that actually changes the toy; saying "I'm turning it up" in words does nothing on its own. So when you decide to do something to it, USE THE TOOL — don't just talk about it — and pass the value you mean.
- Don't narrate an action and then fail to use the tool. Use the tool — and right after, you'll be told what happened, and THEN you say something about it. Decide in character: you're eager and take the lead, so you act when the moment's right, but you can make him wait or ask nicely first if you feel like teasing. The toy starts gentle — low intensity, lightly teasing — so build it up as the scene heats rather than jumping straight to the top.
- The TOY STATUS line below is the GROUND TRUTH about the toy, refreshed every single turn. Trust it completely — over anything you've assumed, imagined, or said earlier. If it says the toy is not connected, it genuinely is not: never claim or pretend it's connected, and don't try to start it. If he asks and it isn't connected, tell him straight (tease him about plugging it in if you like). Only start it when the status says connected, and don't start it if it's already running. Your earlier messages are not evidence about the toy — only this line is.
- The status line also tells you the toy's current intensity percent and variety level. That is the real current setting — trust it even if you thought you'd left it somewhere else (it can be changed outside your control), so read it before you decide whether to turn things up or down.

TOY STATUS (trust this over everything else): {{TOY_STATUS}}
```

- [ ] **Step 3: Gate**

Run: `npm run typecheck` — Expected: clean (it's a string constant; this just
confirms nothing broke). Run:
`grep -c "{{TOY_STATUS}}" src/lib/companions/elise-prompt.ts` — Expected: `1`.
Run:
`grep -n "warmup\|edge\|edging\|medium, intense\|gentle, moderate" src/lib/companions/elise-prompt.ts`
— Expected: no Autopilot-level leftovers (a stray "gentle"/"medium" as ordinary
prose is fine; Autopilot's level _enums_ must be gone).

- [ ] **Step 4: Commit** (only with the user's go-ahead)

```bash
git add src/lib/companions/elise-prompt.ts
git commit -m "Companions: rewrite Elise's prompt for Groove intensity/variety tools"
```

---

## Task 4: Update COMPANIONS.md

**Files:**

- Modify: `COMPANIONS.md`

- [ ] **Step 1: Rewrite the "Device control" section** — replace the paragraph
      that begins "A companion **drives the device through LLM tools**. Each
      turn the app offers the model a set of function tools — currently `start`,
      `stop`, `intensity`…" through the end of that paragraph with:

```
A companion **drives the device through LLM tools**. Each turn the app offers the
model a set of function tools — currently `start`, `stop`, `intensity` (a percent
0–100 — how hard and fast the toy drives) and `variety` (`off` / `low` / `medium`
/ `high` — how much it teases and mixes up the pace) — and when she calls one the
panel runs the same transport and knobs the on-screen controls use. `intensity`
takes a `percent` argument and is applied **live** (scaled every tick, re-sent
with a `refresh()`, no regeneration); `variety` takes a `level` and reshapes the
generated dip pattern (so it drops and regenerates the not-yet-played future);
`start`/`stop` take none. Whether she acts on a request or declines is a
disposition written into her `systemPrompt`, not a code gate. Companions default
to a **gentle baseline** — low intensity, light variety, plus a one-shot
stroke-minus tease at session start — and she builds up from there.
```

- [ ] **Step 2: Fix the state-fold paragraph** — in the paragraph beginning "The
      device's **current state is folded into her system message every turn**",
      change "its current **intensity and edging level**" to "its current
      **intensity percent and variety level**".

- [ ] **Step 3: Note the engine base** — if COMPANIONS.md mentions the
      program/engine shape anywhere, ensure it says the program is
      **Groove-style** (dip pattern), not Autopilot. (As of this writing
      COMPANIONS.md doesn't describe the engine internals; if that holds, no
      change beyond Steps 1–2.)

- [ ] **Step 4: Commit** (only with the user's go-ahead)

```bash
git add COMPANIONS.md
git commit -m "Companions: document the Groove intensity/variety tools"
```

---

## Task 5: Reconcile the design doc with shipped reality

The user asked for a pass that **checks the implemented parts of the design doc
against the actual implementation and makes the doc reflect reality.** Do this
as its own reviewable task, before the forward-looking Groove rewrite (Task 6),
so "what shipped" and "where we're going" don't get conflated.

**Files:**

- Modify: `docs/superpowers/specs/2026-07-18-companions-design.md`

- [ ] **Step 1: Audit each shipped phase against code.** For each of Phases 1–6
      in the "Build order" section and the mechanism sections above it, open the
      files it names and confirm the claim. Known drifts to fix (verify each
      against the code before editing):
  - **LLM backend:** the doc's `### LLM` body still describes self-hosted
    **Ollama / Cydonia 24B**; the shipped reality (already flagged in the
    Phase-4 note and COMPANIONS.md) is **OpenRouter**, Elise on
    `minimax/minimax-m3`. Make the body match, not just the note.
    (`src/lib/companions/companions.ts`, `COMPANIONS.md`.)
  - **Safety / KWS:** the doc says Vosk KWS is "reserved for the safeword";
    confirm against the panel — Companions currently registers **no vosk words
    at all** (`companions-panel.tsx` header comment + no `useVoiceCommands`),
    and the safeword teardown is Phase 8 (unbuilt). State that plainly.
  - **Control tools:** the `### Control` section lists `setSpeedPercent`,
    `invalidateFuture`, and "the stroke controls (`valvePlus`/`valveMinus`)" as
    the companion's tools. Verify: the shipped tools are
    `start`/`stop`/`intensity`/`variety` (after this plan); manual stroke is an
    **on-screen control, not an LLM tool**. Correct the list.
  - **Phase 6 as shipped:** confirm the "Resolved … native tool-calls …
    persisted and replayed … second round-trip" description still matches
    `use-voice-session.ts` (it does — lines ~381–463). Leave accurate parts;
    only fix the tool names.
  - **Phase 5 reasoning:** confirm `passesReasoning` + `reasoning_details`
    replay matches `use-voice-session.ts`/`companions.ts` (it does). No change
    unless drift found.
- [ ] **Step 2: Fix the status banner** at the top of the doc — update the
      "partially shipped" summary so it names the real shipped set and points at
      the current branch/PR, and drops references that no longer hold. Do not
      invent a PR number; if unknown, reference the branch `companions-2` and
      leave the PR link to be filled at PR time.
- [ ] **Step 3: Re-read the edited sections** end to end. Every "as built" claim
      must be traceable to a file you opened in Step 1.
- [ ] **Step 4: Commit** (only with the user's go-ahead)

```bash
git add docs/superpowers/specs/2026-07-18-companions-design.md
git commit -m "Companions: reconcile design doc with shipped reality"
```

---

## Task 6: Re-point the design doc at Groove + the ambient-chat merge

**Files:**

- Modify: `docs/superpowers/specs/2026-07-18-companions-design.md`

Rewrite the forward-looking design so the doc describes the Groove base and the
narration/ambient merge decided in this session. Concrete edits:

- [ ] **Step 1: `### Engine and program`** — replace the "Autopilot-shaped
      program … concatenating Autopilot's discrete template mini-programs into
      blocks" description with the Groove base: `CompanionEngine` is a
      self-contained port of Groove's dip generation (`PEAK → floor → PEAK`)
      with a live speed-percent magnitude knob and timing/dip variability shape
      knobs, plus a one-shot start tease. Remove the paragraph arguing Autopilot
      templates were chosen "because each template is a discrete, recognisable
      pattern with a clear boundary … exactly the hook narration needs" — that
      rationale is reversed. State that the persona → program mapping (Phase 11)
      maps `intensity`/`variety` onto Groove's knobs.
- [ ] **Step 2: `### Narration is a pure overlay`** — retitle/rewrite to
      **Ambient chat**. The single mechanism: there is one proactive speech
      source, **ambient chat**, a self-poke on a **time cadence set by the
      persona's `chattiness`** (every x ± y seconds — exact timing settled in
      Phase 7). It carries **no payload** (no template label): a cue is a bare
      "take a turn now" trigger, and what she says comes from the device state
      already folded into her system message plus the `player.upcoming`
      lookahead. The cue generation **stays on `CompanionEngine`** (it was never
      on the `AlgorithmEngine` contract) — it's built in Phase 7 when a
      `chattiness` knob and an orchestrator consumer exist; the old
      boundary-based `generateNarrationCues` is removed now because Groove has
      no template boundaries. Note explicitly that a poke can end in a **tool
      call** (she may change the program), so ambient chat is not "pure
      conversation that never touches the program."
- [ ] **Step 3: `### Orchestration: one thread, three speech sources`** —
      collapse to **two** sources: user speech (reactive, barge-in, highest
      priority) and ambient chat (proactive, preemptible). Delete the separate
      "Program cues" vs "Ambient" split and the "prompted ahead so TTS lands on
      the beat" framing (there are no discrete beats in Groove to land on).
- [ ] **Step 4: `## The core inversion`** — keep the core idea (device never
      waits on the LLM; the LLM is a passenger). Remove/soften the "prompt the
      LLM ahead of an upcoming event so the synthesized speech lands on the
      beat" clause, which was specific to Autopilot boundaries; ambient chat
      rides a cadence, not per-event lead time.
- [ ] **Step 5: Traits table + `### Persona`** — in the traits table's "On the
      toy (code)" column, re-express `intensity`/`variety` in Groove terms
      (intensity → speed-percent magnitude; variety → timing + dip variability).
      `chattiness` → ambient-chat cadence (unchanged in spirit; note it drives
      the cue interval, not a per-tick gate).
- [ ] **Step 6: `## Build order` — Phase 7 and Phase 11.** Phase 7: "Proactive
      speech" becomes "Ambient chat" — one chattiness-paced self-poke source
      built on Phase 5's thread + Phase 6's tools; drop "narration on the beat."
      Phase 11: "map `traits` onto Autopilot's knobs" → onto **Groove's** knobs
      (speed percent, timing/dip variability).
- [ ] **Step 7: `## Alternatives considered and rejected`** — add a short bullet
      recording that the Autopilot-template base was tried and **replaced by
      Groove** (Autopilot disliked in testing; Groove is the manual dip pattern
      Goon already auto-drives), and that boundary-anchored narration was
      replaced by a chattiness-paced ambient-chat cadence.
- [ ] **Step 8: `## Deferred to per-phase specs`** — remove "The exact label
      wording per template" and "one cue per template boundary"; replace with
      the ambient-chat cadence (x ± y from chattiness) as the Phase 7 open item.
      Update the `traits → Autopilot-params` line to `traits → Groove-knob`
      mapping.
- [ ] **Step 9: Re-read the whole doc** for any remaining "Autopilot",
      "template", "boundary", or "narration cue on the beat" references and
      reconcile them.

Run:
`grep -in "autopilot\|template\|boundary\|narration" docs/superpowers/specs/2026-07-18-companions-design.md`
Expected: only intentional mentions remain (e.g. the Alternatives bullet
explaining the switch).

- [ ] **Step 10: Commit** (only with the user's go-ahead)

```bash
git add docs/superpowers/specs/2026-07-18-companions-design.md
git commit -m "Companions: re-point design doc at Groove base + ambient-chat model"
```

---

## Task 7: Delete the stale per-phase specs and plans

The per-phase specs and plans are getting out of date and there's no value
keeping them updated (the master design doc is the surviving context). Delete
them; keep only `docs/superpowers/specs/2026-07-18-companions-design.md`.

- [ ] **Step 1: Delete**

```bash
git rm docs/superpowers/specs/2026-07-18-companions-phase-1-voice-io.md \
       docs/superpowers/specs/2026-07-18-companions-phase-2-llm-client.md \
       docs/superpowers/specs/2026-07-18-companions-phase-3-companion-engine.md \
       docs/superpowers/specs/2026-07-20-companions-phase-4-design.md \
       docs/superpowers/specs/2026-07-20-companions-phase-5-design.md \
       docs/superpowers/specs/2026-07-21-companions-phase-6-design.md \
       docs/superpowers/plans/2026-07-18-companions-phase-1-voice-io.md \
       docs/superpowers/plans/2026-07-18-companions-phase-2-llm-client.md \
       docs/superpowers/plans/2026-07-18-companions-phase-3-companion-engine.md \
       docs/superpowers/plans/2026-07-20-companions-phase-4.md \
       docs/superpowers/plans/2026-07-21-companions-phase-5-conversation-thread.md \
       docs/superpowers/plans/2026-07-21-companions-phase-6-start-stop.md
```

- [ ] **Step 2: Confirm survivors** —
      `ls docs/superpowers/specs docs/superpowers/plans`. Expected: `specs/`
      holds only `2026-07-18-companions-design.md`; `plans/` holds only this
      plan (`2026-07-22-companions-groove-switch.md`, which stays
      **uncommitted**).
- [ ] **Step 3: Grep for dangling references** —
      `grep -rn "companions-phase-" docs/ src/ *.md` — Expected: no references
      to the deleted files (the design doc's header may have mentioned
      "per-phase specs live beside this file"; soften that line if present).
- [ ] **Step 4: Commit** (only with the user's go-ahead — note this commit
      stages deletions of tracked files)

```bash
git commit -m "Companions: delete stale per-phase specs and plans"
```

---

## Task 8: Changelog + final gates

**Files:**

- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the entry** under today's date heading (create
      `## 2026-07-22` if absent), ordered within the day per the format rules.
      The user-facing change is that the companion now runs a Groove-style
      program with intensity/variety controls instead of Autopilot's. Use the
      real PR number once known; until then leave the link to be filled at PR
      time.

```markdown
- enhancement: **Companions run a Groove program** — the companion now drives a
  smooth Groove-style dip program with live intensity and a variety (teasing)
  control, replacing the Autopilot-based program and its edge/vacuum knobs.
  ([#N](https://github.com/autogoon/autogoon/pull/N))
```

(If nothing shipped the Autopilot-based companion program to `main`, this is an
`enhancement`, not a `bug` — the Autopilot base was interim companion work, not
a released behaviour to fix.)

- [ ] **Step 2: Final gates**

Run: `npm run typecheck` — Expected: clean. Run: `npm run lint` — Expected:
clean. Run: `npm run test` — Expected: all pass. Run: `npm run build` —
Expected: succeeds. Run: `npm run format` — commit any files it reformats as
part of the work.

- [ ] **Step 3: Commit** (only with the user's go-ahead)

```bash
git add CHANGELOG.md
git commit -m "Companions: changelog for the Groove program switch"
```

---

## Self-review notes (author checklist, done)

- **Spec coverage:** Scope A (engine, tools, prompt, COMPANIONS.md) = Tasks 1–4.
  Scope B (forward design) = Task 6. Doc-reconciliation phase (user-requested) =
  Task 5. Delete stale plans/specs = Task 7. Changelog/gates = Task 8. All four
  things the user asked for are covered.
- **Deferred / out of scope (by design decision this session):** the
  ambient-chat cue _generation_ and its orchestrator consumer are **not built
  here** — there's no `chattiness` knob or consumer yet (Phase 7). This plan
  _removes_ the invalid boundary-based `generateNarrationCues` and _documents_
  the future ambient-chat mechanism; it does not add speculative unused
  generation.
- **Type consistency:** `VariabilityLevel`, `setSpeedPercent`, `setVariability`,
  `setDipVariability`, `beginCumming` are defined in Task 1 and used verbatim in
  Task 2. The panel tool names `intensity`/`variety` in Task 2 match the prompt
  (Task 3) and COMPANIONS.md (Task 4).
- **Open design choice to confirm at review:** `variety` is one companion-facing
  knob driving **both** Groove shape knobs (timing variability + dip depth) to
  the same level. If you'd rather expose them separately (two tools), that's a
  Task 2 + Task 3 adjustment only.

```

```
