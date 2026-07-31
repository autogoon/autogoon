# Companion time zones implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a companion a clock of their own, and let a pack say whether that
clock is real and whether the companion is told the user's.

**Architecture:** Three fields on a pack's `companion` section flow through the
existing manifest → `Companion` → prompt path. `describeClock` gains a required
zone and takes its parts from `Intl.DateTimeFormat.formatToParts` instead of the
local-zone getters. `liveStateMessage` emits up to two labelled TIME lines in
the trailing system message, so nothing volatile enters the persona prompt.

**Tech Stack:** TypeScript, Next.js, Jest (`@jest/globals`),
`Intl.DateTimeFormat`.

## Global Constraints

- The design this implements is
  [docs/specs/2026-07-31-companion-time-zones.md](../specs/2026-07-31-companion-time-zones.md).
  Where this plan and the spec disagree, the spec is the decision.
- Change files with **Edit and Write, never a shell rewrite** (CLAUDE.md →
  Editing files).
- `npm run lint` runs at `--max-warnings 0`. Gate on `npm run lint` and
  `npm run typecheck` being completely clean before finishing.
- Run `npm run format` before committing; commit what it changes.
- Every test is held to CLAUDE.md → Verifying changes → What a test is for. In
  particular: a test that cannot fail is removed, and a fake supplies input
  while the assertion is on something the code under test decided.
- Never commit a companion's real location or name into anything outside
  `src/lib/companions/` and `goonpacks/` — the spec and this plan name neither.
- Do not run `npm run goonpack:describe`, `describe-missing` or `summarise`:
  they spend real money. Build them, exercise the error paths, hand the run
  over.

---

### Task 1: `describeClock` takes the zone it renders in

**Files:**

- Modify: `src/lib/companions/conversation.ts` (`describeClock`)
- Modify: `src/hooks/use-voice-session.ts` (`liveState`, the only caller)
- Test: `src/lib/companions/conversation.test.ts`

**Interfaces:**

- Produces: `describeClock(at: number, timeZone: string): string` and
  `browserTimeZone(): string`, both exported from
  `src/lib/companions/conversation.ts`.

- [ ] **Step 1: Rewrite the existing tests against a fixed instant and zone**

The three existing cases build their input with `new Date(2026, 6, 23, 14, 5)` —
local parts — and assert a local rendering, so the two cancel and the test
passes under any `TZ`. With the zone passed in, that cancellation goes. Replace
the whole `describe('describeClock', …)` block in
`src/lib/companions/conversation.test.ts`:

```ts
describe('describeClock', () => {
  it('formats a timestamp as weekday, date and 12-hour time in the zone it is given', () => {
    // 13:05 UTC on 23 July 2026 is 14:05 in London, which is on BST by then.
    expect(describeClock(Date.UTC(2026, 6, 23, 13, 5), 'Europe/London')).toBe(
      'Thursday 23 July 2026, 2:05 pm',
    );
  });

  it('renders midnight as 12:00 am', () => {
    expect(describeClock(Date.UTC(2026, 0, 5, 0, 0), 'Europe/London')).toBe(
      'Monday 5 January 2026, 12:00 am',
    );
  });

  it('renders half past noon as 12:30 pm', () => {
    expect(describeClock(Date.UTC(2026, 0, 5, 12, 30), 'Europe/London')).toBe(
      'Monday 5 January 2026, 12:30 pm',
    );
  });

  it('renders one instant differently in two zones', () => {
    const at = Date.UTC(2026, 6, 23, 13, 5);
    expect(describeClock(at, 'Europe/London')).toBe(
      'Thursday 23 July 2026, 2:05 pm',
    );
    expect(describeClock(at, 'America/Los_Angeles')).toBe(
      'Thursday 23 July 2026, 6:05 am',
    );
  });

  it('follows a DST transition rather than a fixed offset', () => {
    // London moves to BST at 01:00 UTC on 29 March 2026, the last Sunday.
    expect(describeClock(Date.UTC(2026, 2, 29, 0, 30), 'Europe/London')).toBe(
      'Sunday 29 March 2026, 12:30 am',
    );
    expect(describeClock(Date.UTC(2026, 2, 29, 1, 30), 'Europe/London')).toBe(
      'Sunday 29 March 2026, 2:30 am',
    );
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest src/lib/companions/conversation.test.ts -t describeClock`
Expected: FAIL — `describeClock` takes one argument, so TypeScript rejects the
second, and the DST and two-zone cases assert values the local-getter version
cannot produce.

- [ ] **Step 3: Rewrite `describeClock` and add `browserTimeZone`**

In `src/lib/companions/conversation.ts`, replace `describeClock` and the comment
above it:

```ts
// A timestamp for the prompt, in the zone asked for: "Thursday 23 July 2026,
// 2:05 pm". The zone is required rather than defaulted — a caller passing
// nothing could not tell from here whose clock came back. The name parts come
// from Intl (en-GB — the prompt speaks English regardless of the user's
// locale); the assembly stays manual so the overall shape can't drift with the
// ICU version's combined-format separators. `hourCycle: 'h23'` rather than
// `hour12: false`, which yields 24 for midnight under some ICU versions and
// would render it as 12 pm.
export function describeClock(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  const hour24 = Number(part('hour'));
  const hour12 = ((hour24 + 11) % 12) + 1;
  const ampm = hour24 < 12 ? 'am' : 'pm';
  return `${part('weekday')} ${Number(part('day'))} ${part('month')} ${part('year')}, ${hour12}:${part('minute')} ${ampm}`;
}

// The zone the browser is in. Its own function so a call site says whose clock
// it is asking for.
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest src/lib/companions/conversation.test.ts -t describeClock`
Expected: PASS, all five.

- [ ] **Step 5: Update the only caller**

In `src/hooks/use-voice-session.ts`, `liveState` currently calls
`describeClock(Date.now())`. Change that one argument list to
`describeClock(Date.now(), browserTimeZone())`, and add `browserTimeZone` to the
existing import from `../lib/companions/conversation`.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run format
git add src/lib/companions/conversation.ts src/lib/companions/conversation.test.ts src/hooks/use-voice-session.ts
git commit -m "Render a clock in the zone it is asked for"
```

---

### Task 2: `liveStateMessage` emits labelled lines

**Files:**

- Modify: `src/lib/companions/shared-prompt.ts` (`liveStateMessage`, and
  `TIME_SECTION` split into three)
- Modify: `src/lib/goonpacks/prompt.ts` (its import and the sections it appends)
- Modify: `src/hooks/use-voice-session.ts` (`liveState`)
- Test: `src/lib/companions/shared-prompt.test.ts`

**Interfaces:**

- Consumes: `describeClock`, `browserTimeZone` from Task 1.
- Produces:
  `liveStateMessage({ userNow?: string; companionNow?: string; toyStatus: string }): string`,
  and `USER_CLOCK_SECTION`, `COMPANION_CLOCK_SECTION`,
  `CONVERSATION_GAPS_SECTION` in place of `TIME_SECTION`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/companions/shared-prompt.test.ts`:

```ts
describe('liveStateMessage', () => {
  it('emits the user line alone when the companion has no clock', () => {
    expect(
      liveStateMessage({
        userNow: 'Thursday 23 July 2026, 2:05 pm',
        toyStatus: 'idle',
      }),
    ).toBe(
      'THEIR TIME (right now): Thursday 23 July 2026, 2:05 pm\n' +
        'TOY STATUS (trust this over everything else): idle',
    );
  });

  it('puts the companion line above the user line when both are given', () => {
    expect(
      liveStateMessage({
        userNow: 'Thursday 23 July 2026, 2:05 pm',
        companionNow: 'Thursday 23 July 2026, 6:05 am',
        toyStatus: 'idle',
      }),
    ).toBe(
      'MY TIME (right now): Thursday 23 July 2026, 6:05 am\n' +
        'THEIR TIME (right now): Thursday 23 July 2026, 2:05 pm\n' +
        'TOY STATUS (trust this over everything else): idle',
    );
  });

  it('emits the companion line alone when the user clock is withheld', () => {
    expect(
      liveStateMessage({
        companionNow: 'Thursday 23 July 2026, 6:05 am',
        toyStatus: 'idle',
      }),
    ).toBe(
      'MY TIME (right now): Thursday 23 July 2026, 6:05 am\n' +
        'TOY STATUS (trust this over everything else): idle',
    );
  });

  it('emits TOY STATUS alone when neither clock is given', () => {
    expect(liveStateMessage({ toyStatus: 'idle' })).toBe(
      'TOY STATUS (trust this over everything else): idle',
    );
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest src/lib/companions/shared-prompt.test.ts -t liveStateMessage`
Expected: FAIL — the current signature takes two positional strings.

- [ ] **Step 3: Rewrite `liveStateMessage`**

In `src/lib/companions/shared-prompt.ts`, replace `liveStateMessage` and the
comment above it. Keep the prefix-caching paragraph; replace the label sentence:

```ts
// The values that change every turn, as their own system message at the end of
// a request rather than inside the persona prompt. Prompt caching matches a
// prefix of tokens: with these inside the persona prompt, a request would
// diverge from the last one within a few hundred tokens of its start, so
// nothing after them — including the whole conversation — could be reused.
// Last means everything before is byte-identical turn to turn.
//
// An object rather than positional strings, which could be transposed without
// a type error. An absent member states a fact about the companion — no clock
// of their own, or not told the user's — so nothing is substituted for it.
//
// Ownership is in the label, not after it: a companion sent a single line read
// it as their own. MY TIME leads for the same reason. USER_CLOCK_SECTION and
// COMPANION_CLOCK_SECTION name these labels, so renaming one here leaves a
// section describing a line the companion is never sent.
export const liveStateMessage = ({
  userNow,
  companionNow,
  toyStatus,
}: {
  userNow?: string;
  companionNow?: string;
  toyStatus: string;
}): string =>
  [
    companionNow === undefined
      ? undefined
      : `MY TIME (right now): ${companionNow}`,
    userNow === undefined ? undefined : `THEIR TIME (right now): ${userNow}`,
    `TOY STATUS (trust this over everything else): ${toyStatus}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
```

- [ ] **Step 4: Split `TIME_SECTION` into three**

Still in `src/lib/companions/shared-prompt.ts`, replace `TIME_SECTION` and the
comment above it with three constants. Each is appended only when the line it
describes is sent (Task 7), so no companion is told how to read a line they
never get. Leave `CONTROL_SECTION` alone — it names TOY STATUS, which is not
being renamed:

```ts
// The clock rules, one block per line the companion may be sent, so a
// companion who is not given a line is never told how to read it. Deliberately
// not {{token}}s: a pack author who never heard of them would leave their
// companion unable to read a line they are still sent. prompt.ts appends
// whichever apply.
export const USER_CLOCK_SECTION = `HIS TIME:
- THEIR TIME is the real date and time right now where HE is, refreshed every
  turn. Trust it over any time of day your setup assumes.`;

export const COMPANION_CLOCK_SECTION = `YOUR TIME:
- MY TIME is the real date and time right now where YOU are, refreshed every
  turn. It is yours, not his: he may be hours ahead of you or behind you.
- Let it show. What time it is where you are belongs in what you say — being
  tired, having just eaten, the light going — the way it would for anyone.`;

// A break in the conversation, which is about neither clock, so it is sent to
// every companion whatever they are told about time.
export const CONVERSATION_GAPS_SECTION = `GAPS:
- A note like "(3 hours pass.)" in the conversation means he really went away
  for that long and just came back — react like someone who noticed the break,
  don't carry on as if mid-sentence.`;
```

Nothing outside `shared-prompt.ts` and `prompt.ts` names `TIME_SECTION`, so this
rename is contained. `prompt.ts` still imports and appends only `TIME_SECTION`
at this point and will not compile — Task 7 rewires it. To keep this task's
commit green, have `prompt.ts` append all three unconditionally for now:

```ts
return `${filled}\n\n${USER_CLOCK_SECTION}\n\n${CONVERSATION_GAPS_SECTION}`;
```

which is what every companion gets today, and update
`src/lib/goonpacks/prompt.test.ts` and `src/lib/goonpacks/resolve.test.ts`
wherever they import or assert `TIME_SECTION`.

- [ ] **Step 5: Update the caller**

In `src/hooks/use-voice-session.ts`, `liveState` becomes:

```ts
const liveState = (deviceState: string): LlmMessage => ({
  role: 'system',
  content: liveStateMessage({
    userNow: describeClock(Date.now(), browserTimeZone()),
    toyStatus: deviceState === '' ? 'unknown' : deviceState,
  }),
});
```

The companion's own clock is wired in at Task 8; until then every companion is
sent the user's line alone, exactly as today.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run format
git add src/lib/companions/shared-prompt.ts src/lib/companions/shared-prompt.test.ts src/lib/goonpacks/prompt.ts src/lib/goonpacks/prompt.test.ts src/lib/goonpacks/resolve.test.ts src/hooks/use-voice-session.ts
git commit -m "Label each TIME line with whose clock it is"
```

---

### Task 3: The three manifest fields

**Files:**

- Modify: `src/lib/goonpacks/manifest.ts`
- Test: `src/lib/goonpacks/manifest.test.ts`

**Interfaces:**

- Produces: `CompanionConfig.timezone?: string`,
  `CompanionConfig.usesRealTime?: boolean`,
  `CompanionConfig.knowsUserTime?: boolean`, all parsed by `parseManifest`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/goonpacks/manifest.test.ts`, following the file's existing
fixture style:

```ts
it('accepts an IANA time zone on the companion section', () => {
  const m = parseManifest({
    format: 1,
    id: 'test.pack',
    version: '1.0.0',
    aboutThePack: 'a test pack',
    companion: { timezone: 'America/New_York' },
  });
  expect(m.companion.timezone).toBe('America/New_York');
});

it('reports a timezone that is not a zone this runtime can render', () => {
  expect(() =>
    parseManifest({
      format: 1,
      id: 'test.pack',
      version: '1.0.0',
      aboutThePack: 'a test pack',
      companion: { timezone: 'Mars/Olympus_Mons' },
    }),
  ).toThrow(/timezone field must be an IANA time zone name/);
});

it('reports a usesRealTime that is not a boolean', () => {
  expect(() =>
    parseManifest({
      format: 1,
      id: 'test.pack',
      version: '1.0.0',
      aboutThePack: 'a test pack',
      companion: { usesRealTime: 'yes' },
    }),
  ).toThrow(/usesRealTime field must be true or false/);
});

it('accepts a timezone on an overlay, which may move a companion', () => {
  const m = parseManifest({
    format: 1,
    id: 'test.overlay',
    version: '1.0.0',
    aboutThePack: 'a test overlay',
    base: 'test.pack',
    companion: { timezone: 'Europe/Paris' },
  });
  expect(m.companion.timezone).toBe('Europe/Paris');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest src/lib/goonpacks/manifest.test.ts -t timezone` Expected: FAIL —
`timezone` is not in `COMPANION_FIELDS`, so the manifest is rejected for
carrying an unknown field.

- [ ] **Step 3: Add the fields to the type and the allow-list**

In `src/lib/goonpacks/manifest.ts`, add to `CompanionConfig`:

```ts
  // IANA zone. Where the companion is NOW, not where they are from — an
  // overlay that takes them somewhere else sets its own.
  timezone?: string;
  // Whether a real clock is computed for this companion at all. False says the
  // persona prompt supplies its own time of day, and a real one would
  // contradict it. A flag rather than an absent timezone, because an overlay
  // can set a field but never clear one.
  usesRealTime?: boolean;
  // Whether the companion is told the time where the user is.
  knowsUserTime?: boolean;
```

and to `COMPANION_FIELDS`: `'timezone'`, `'usesRealTime'`, `'knowsUserTime'`.

- [ ] **Step 4: Validate them**

In `parseManifest`, beside the `chattiness`/`playfulness` loop:

```ts
for (const flag of ['usesRealTime', 'knowsUserTime'] as const) {
  if (c[flag] !== undefined && typeof c[flag] !== 'boolean') {
    problems.push(`The ${flag} field must be true or false (no quotes).`);
  }
}
```

and beside the other `optionalString` calls:

```ts
const timezone = optionalString(c.timezone, 'timezone');
// Constructing the formatter the renderer will use: a zone that validates
// here is a zone that renders on this runtime. A regex accepts zones the
// renderer rejects, and Intl.supportedValuesOf omits aliases it accepts.
if (timezone !== undefined) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone });
  } catch {
    problems.push(
      'The timezone field must be an IANA time zone name, like "America/New_York".',
    );
  }
}
```

Then add to the returned `companion` object:

```ts
      timezone,
      usesRealTime: c.usesRealTime as boolean | undefined,
      knowsUserTime: c.knowsUserTime as boolean | undefined,
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest src/lib/goonpacks/manifest.test.ts` Expected: PASS.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run format
git add src/lib/goonpacks/manifest.ts src/lib/goonpacks/manifest.test.ts
git commit -m "Take a time zone and two clock flags from a manifest"
```

---

### Task 4: A complete pack on real time needs a zone

**Files:**

- Modify: `src/lib/goonpacks/pack.ts` (the `manifest.base === undefined` branch)
- Test: `src/lib/goonpacks/pack.test.ts`

**Interfaces:**

- Consumes: `CompanionConfig.timezone` and `.usesRealTime` from Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/goonpacks/pack.test.ts`, matching the fixture helper the
neighbouring complete-pack tests use:

```ts
it('rejects a complete pack on real time with no timezone', async () => {
  await expect(
    parsePack(
      packSource({
        companion: {
          name: 'Test',
          description: 'a test companion',
          voiceId: 'v1',
        },
      }),
    ),
  ).rejects.toThrow(/needs a timezone field/);
});

it('accepts a complete pack with no timezone when usesRealTime is false', async () => {
  const pack = await parsePack(
    packSource({
      companion: {
        name: 'Test',
        description: 'a test companion',
        voiceId: 'v1',
        usesRealTime: false,
      },
    }),
  );
  expect(pack.manifest.companion.usesRealTime).toBe(false);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest src/lib/goonpacks/pack.test.ts -t timezone` Expected: FAIL — the
first test's pack is accepted today.

- [ ] **Step 3: Add the rule**

In `src/lib/goonpacks/pack.ts`, inside the `manifest.base === undefined` branch,
after the `description` check:

```ts
// usesRealTime defaults to true, so a pack states which it is rather
// than implying it by leaving a field out. An overlay is not checked
// here: it may take the zone from its base, which only resolution knows
// (library.ts).
if (
  manifest.companion.usesRealTime !== false &&
  manifest.companion.timezone === undefined
) {
  problems.push(
    'A complete pack needs a timezone field in the companion section of manifest.json, or usesRealTime: false if the persona sets its own time of day.',
  );
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest src/lib/goonpacks/pack.test.ts` Expected: PASS.

- [ ] **Step 5: Widen the fixtures this rule breaks**

Every existing fixture that builds a complete pack without a zone is now
refused, and none of them pin anything about clocks. Two files:

`src/lib/goonpacks/pack.test.ts` — add `usesRealTime: false` to the `companion`
object of each complete-pack fixture.

`src/lib/goonpacks/library.test.ts` — `completePack` gains it, and both pack
helpers gain a `companion` override so later tasks can vary the new fields:

```ts
const completePack = (id: string, companion: object = {}) => ({
  'manifest.json': manifest({
    id,
    mediaSummary: 'A still and a video.',
    companion: {
      name: 'Testy',
      description: 'a test companion',
      voiceId: 'v',
      // Clocks are not what these tests pin, and a complete pack on real time
      // needs a zone (parsePack).
      usesRealTime: false,
      ...companion,
    },
  }),
  'system-prompt.md': 'You are Testy.',
  'media/a.jpg': '',
  'media/a.md': sidecar('a still', 'a still, described at length'),
  'media/b.mp4': '',
  'media/b.md': sidecar('a video', 'a video, described at length'),
});

const overlayPack = (id: string, base: string, companion: object = {}) => ({
  'manifest.json': manifest({
    id,
    base,
    mediaSummary: 'A still and a video.',
    companion: { voiceId: 'v2', ...companion },
  }),
  'media/a.jpg': '',
  'media/a.md': sidecar('a still', 'a still, described at length'),
  'media/b.mp4': '',
  'media/b.md': sidecar('a video', 'a video, described at length'),
});
```

Run: `npm test` Expected: PASS across both files.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run format
git add src/lib/goonpacks/pack.ts src/lib/goonpacks/pack.test.ts src/lib/goonpacks/library.test.ts
git commit -m "Require a zone on a complete pack that uses real time"
```

---

### Task 5: The fields reach `Companion`

**Files:**

- Modify: `src/lib/companions/companions.ts` (`Companion`, defaults)
- Modify: `src/lib/goonpacks/resolve.ts` (`packToCompanionRaw`, `applyOverlay`)
- Test: `src/lib/goonpacks/resolve.test.ts`

**Interfaces:**

- Produces: `Companion.timezone?: string`, `Companion.usesRealTime: boolean`,
  `Companion.knowsUserTime: boolean`; `DEFAULT_USES_REAL_TIME`,
  `DEFAULT_KNOWS_USER_TIME` exported from `src/lib/companions/companions.ts`.

- [ ] **Step 1: Write the failing tests**

`resolve.test.ts` already has a `base: Companion` literal and an
`overlay(extra?, media?)` helper. Add the two required flags to `base`:

```ts
  chattiness: 2,
  playfulness: 4,
  usesRealTime: true,
  knowsUserTime: true,
};
```

then add these tests, using those two helpers:

```ts
it("takes the overlay's timezone over the base's", () => {
  const out = applyOverlay(
    { ...base, timezone: 'Europe/Paris' },
    overlay({ companion: { timezone: 'Asia/Tokyo' } }),
  );
  expect(out.timezone).toBe('Asia/Tokyo');
});

it("keeps the base's timezone when the overlay sets none", () => {
  const out = applyOverlay({ ...base, timezone: 'Europe/Paris' }, overlay());
  expect(out.timezone).toBe('Europe/Paris');
});

it("takes the overlay's knowsUserTime over the base's", () => {
  const out = applyOverlay(
    { ...base, knowsUserTime: true },
    overlay({ companion: { knowsUserTime: false } }),
  );
  expect(out.knowsUserTime).toBe(false);
});

it('defaults both clock flags to true when a pack sets neither', () => {
  const c = packToCompanionRaw({
    manifest: {
      format: 1,
      id: 'some.base',
      version: '1',
      aboutThePack: 'a base pack',
      companion: { name: 'Base', voiceId: 'v' },
    },
    systemPrompt: 'hi',
    media: [],
  });
  expect(c.usesRealTime).toBe(true);
  expect(c.knowsUserTime).toBe(true);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest src/lib/goonpacks/resolve.test.ts -t timezone` Expected: FAIL —
`Companion` has no `timezone`.

- [ ] **Step 3: Add the fields to `Companion` and the defaults**

In `src/lib/companions/companions.ts`, after `playfulness`:

```ts
  // IANA zone, absent when this companion has no clock of their own. Absent
  // rather than defaulted, like `media` and `mediaSummary`: no zone is a fact
  // about the companion, not a value waiting to be filled in.
  //
  // The type allows `usesRealTime: true` with no zone, which validation
  // refuses (parsePack, library.ts) — a discriminated union would make it
  // unrepresentable, but applyOverlay builds a Companion by spreading the base
  // and a union does not survive that.
  timezone?: string;
  usesRealTime: boolean; // false: the persona prompt supplies its own time of day
  knowsUserTime: boolean; // false: the user's TIME line is left out
```

and beside the other defaults:

```ts
export const DEFAULT_USES_REAL_TIME = true;
export const DEFAULT_KNOWS_USER_TIME = true;
```

- [ ] **Step 4: Resolve them**

In `src/lib/goonpacks/resolve.ts`, add to the object `packToCompanionRaw`
returns:

```ts
    timezone: c.timezone,
    usesRealTime: c.usesRealTime ?? DEFAULT_USES_REAL_TIME,
    knowsUserTime: c.knowsUserTime ?? DEFAULT_KNOWS_USER_TIME,
```

and to the object `applyOverlay` returns:

```ts
    timezone: c.timezone ?? base.timezone,
    usesRealTime: c.usesRealTime ?? base.usesRealTime,
    knowsUserTime: c.knowsUserTime ?? base.knowsUserTime,
```

Import the two defaults from `@/lib/companions/companions`.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest src/lib/goonpacks/resolve.test.ts` Expected: PASS.
`npm run typecheck` will now fail everywhere a `Companion` literal is built
without the two required flags — the built-ins in
`src/lib/companions/companions.ts` and every test fixture. Add
`usesRealTime: true, knowsUserTime: true` to each fixture; the built-ins' real
values are Task 8's, so give them the same two for now.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run format
git add src/lib/companions/companions.ts src/lib/goonpacks/resolve.ts src/lib/goonpacks/resolve.test.ts
git commit -m "Carry the zone and the clock flags onto Companion"
```

---

### Task 6: A resolved overlay on real time needs a zone

**Files:**

- Modify: `src/lib/goonpacks/library.ts` (the cross-pack pass)
- Test: `src/lib/goonpacks/library.test.ts`

**Interfaces:**

- Consumes: `PackManifest.companion.timezone` and `.usesRealTime` from Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/goonpacks/library.test.ts`, using the `source()` fake and the
two pack helpers Task 4 widened:

```ts
it('lists an overlay that turns on real time over a base with no zone as incompatible', async () => {
  const lib = await buildLibrary(
    source({
      'pub.comp@1.0.0': completePack('pub.comp'),
      'pub.over@1.0.0': overlayPack('pub.over', 'pub.comp', {
        usesRealTime: true,
      }),
    }),
  );
  expect(lib.rows.find((r) => r.id === 'pub.over@1.0.0')!.incompatible).toEqual(
    [
      'This overlay uses real time but needs a timezone — its base companion has none.',
    ],
  );
});

it('accepts an overlay that turns on real time and supplies its own zone', async () => {
  const lib = await buildLibrary(
    source({
      'pub.comp@1.0.0': completePack('pub.comp'),
      'pub.over@1.0.0': overlayPack('pub.over', 'pub.comp', {
        usesRealTime: true,
        timezone: 'Asia/Tokyo',
      }),
    }),
  );
  expect(
    lib.rows.find((r) => r.id === 'pub.over@1.0.0')!.incompatible,
  ).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest src/lib/goonpacks/library.test.ts -t timezone` Expected: FAIL —
the first overlay is currently a survivor.

- [ ] **Step 3: Add the check to the cross-pack pass**

In `src/lib/goonpacks/library.ts`, add this helper above `buildLibrary`'s
cross-pack pass:

```ts
// An overlay may take its zone from the base, so whether the resolved
// companion has one can only be settled after both are known. parsePack has
// already refused a complete pack that needs a zone and has none, so this only
// ever fires on an overlay.
function resolvedZoneError(
  manifest: PackManifest,
  baseCompanionConfig: (id: string) => CompanionConfig | undefined,
): string | null {
  if (manifest.base === undefined) return null;
  const own = manifest.companion;
  const base = baseCompanionConfig(manifest.base);
  const usesRealTime = own.usesRealTime ?? base?.usesRealTime ?? true;
  const timezone = own.timezone ?? base?.timezone;
  if (usesRealTime && timezone === undefined) {
    return 'This overlay uses real time but needs a timezone — its base companion has none.';
  }
  return null;
}
```

Build the lookup beside `isInstalled`, covering both kinds of base:

```ts
// A built-in base is a Companion, a pack base a manifest; both answer the
// two fields resolvedZoneError reads.
const baseCompanionConfig = (id: string): CompanionConfig | undefined => {
  const builtIn = COMPANIONS[id];
  if (builtIn !== undefined) {
    return {
      timezone: builtIn.timezone,
      usesRealTime: builtIn.usesRealTime,
    };
  }
  return valid.find(
    (p) => p.manifest.id === id && p.manifest.base === undefined,
  )?.manifest.companion;
};
```

Then extend the `reason` chain in the survivors loop, after `baseError`:

```ts
    } else {
      reason =
        baseError(p.manifest, isInstalled) ??
        resolvedZoneError(p.manifest, baseCompanionConfig);
    }
```

`baseError` returns `string | null`, so `??` reaches the zone check only when
the base rules pass — which is right, since an overlay with no valid base has no
zone to resolve against.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest src/lib/goonpacks/library.test.ts` Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run format
git add src/lib/goonpacks/library.ts src/lib/goonpacks/library.test.ts
git commit -m "Refuse a resolved overlay that uses real time with no zone"
```

---

### Task 7: Each clock section goes only when its line does

**Files:**

- Modify: `src/lib/goonpacks/prompt.ts` (`fillSharedSections`)
- Modify: `src/lib/goonpacks/resolve.ts` (`fill`, and its three call sites)
- Test: `src/lib/goonpacks/prompt.test.ts`

**Interfaces:**

- Consumes: `USER_CLOCK_SECTION`, `COMPANION_CLOCK_SECTION`,
  `CONVERSATION_GAPS_SECTION` from Task 2.
- Produces:
  `fillSharedSections(prompt, { mediaSummary?, companionTimeZone?, knowsUserTime? })`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/goonpacks/prompt.test.ts`:

```ts
it("appends the companion's clock rules when the companion has a zone", () => {
  expect(
    fillSharedSections('PERSONA', {
      companionTimeZone: 'Asia/Tokyo',
      knowsUserTime: true,
    }),
  ).toContain('MY TIME');
});

it("leaves the companion's clock rules out when the companion has no zone", () => {
  expect(fillSharedSections('PERSONA', { knowsUserTime: true })).not.toContain(
    'MY TIME',
  );
});

it("leaves the user's clock rules out when the user's time is withheld", () => {
  expect(
    fillSharedSections('PERSONA', {
      companionTimeZone: 'Asia/Tokyo',
      knowsUserTime: false,
    }),
  ).not.toContain('THEIR TIME');
});

it('appends the conversation-gap rules whatever the clocks are', () => {
  expect(fillSharedSections('PERSONA', { knowsUserTime: false })).toContain(
    '3 hours pass',
  );
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest src/lib/goonpacks/prompt.test.ts -t clock` Expected: FAIL —
`fillSharedSections` takes neither `companionTimeZone` nor `knowsUserTime`, and
Task 2 left it appending the user block unconditionally.

- [ ] **Step 3: Compose the three sections**

In `src/lib/goonpacks/prompt.ts`, widen `opts`:

```ts
export function fillSharedSections(
  prompt: string,
  opts: {
    mediaSummary?: string;
    companionTimeZone?: string;
    knowsUserTime?: boolean;
  },
): string {
```

and replace the return:

```ts
// Appended rather than offered as {{tokens}}: a pack author who never heard
// of these would leave their companion unable to read a line they are still
// sent. Each block goes only when its line does, so no companion is told how
// to read a line they never get. Called once per companion (resolve.ts), so
// they land once.
const clocks = [
  opts.companionTimeZone === undefined ? undefined : COMPANION_CLOCK_SECTION,
  opts.knowsUserTime === false ? undefined : USER_CLOCK_SECTION,
  CONVERSATION_GAPS_SECTION,
].filter((s): s is string => s !== undefined);
return [filled, ...clocks].join('\n\n');
```

Import the three from `@/lib/companions/shared-prompt` in place of
`TIME_SECTION`.

- [ ] **Step 5: Thread the zone through `resolve.ts`**

`fill` takes the resolved companion instead of two of its fields, since it now
needs three:

```ts
function fill(prompt: string, companion: Companion) {
  return fillSharedSections(prompt, {
    mediaSummary: companion.mediaSummary,
    // A zone that is not used explains nothing, so a companion off real time
    // gets no clock rules of their own however their pack set the zone.
    companionTimeZone: companion.usesRealTime ? companion.timezone : undefined,
    knowsUserTime: companion.knowsUserTime,
  });
}
```

In `resolveDefault`, `packToCompanion` and `applyOverlay`, pass that function's
own resolved companion:

```ts
return { ...raw, systemPrompt: fill(raw.systemPrompt, raw) };
```

`applyOverlay` builds its resolved companion before filling, so pass that rather
than the base.

- [ ] **Step 6: Run the tests and watch them pass**

Run:
`npx jest src/lib/goonpacks/prompt.test.ts src/lib/goonpacks/resolve.test.ts`
Expected: PASS.

- [ ] **Step 7: Send the companion's clock**

In `src/hooks/use-voice-session.ts`, `liveState` needs the companion, which the
hook already holds as `opts.companion`. Give it the second line, and honour
`knowsUserTime`:

```ts
const liveState = (companion: Companion, deviceState: string): LlmMessage => ({
  role: 'system',
  content: liveStateMessage({
    userNow: companion.knowsUserTime
      ? describeClock(Date.now(), browserTimeZone())
      : undefined,
    companionNow:
      companion.usesRealTime && companion.timezone !== undefined
        ? describeClock(Date.now(), companion.timezone)
        : undefined,
    toyStatus: deviceState === '' ? 'unknown' : deviceState,
  }),
});
```

Update the one call inside `submitText` to pass the companion it already has.

- [ ] **Step 8: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run format
git add src/lib/companions/shared-prompt.ts src/lib/goonpacks/prompt.ts src/lib/goonpacks/prompt.test.ts src/lib/goonpacks/resolve.ts src/hooks/use-voice-session.ts
git commit -m "Send a companion their own clock, and the rules for reading it"
```

---

### Task 8: The persona audit, and the values it settles

**Files:**

- Modify: `src/lib/companions/companions.ts` (each built-in's three fields)
- Modify: each `goonpacks/*/manifest.json`
- Modify: any persona prompt a conflict or a gap forces
- Test: `src/lib/companions/companions.test.ts`

**Interfaces:**

- Consumes: everything above.

This task is a reading pass, not a mechanical edit. Its output is a written
report; the code changes follow from it.

- [ ] **Step 1: Read every persona and propose its three values**

For each built-in in `src/lib/companions/` and each pack source under
`goonpacks/`, read the system prompt and write down:

- where the persona says they are, and the IANA zone that is;
- whether the prompt asserts a time of day, which forces `usesRealTime: false`;
- whether the relationship is one where knowing the user's local time makes
  sense, which decides `knowsUserTime`.

- [ ] **Step 2: Flag every conflict, and stop**

Report, for each companion, any of:

- a real clock proposed under a prompt that already fixes a time of day;
- a zone proposed that the prompt never supports;
- `knowsUserTime: true` on a persona written as not knowing the user, or `false`
  on one who plainly would.

Then check coverage across the whole set. The spec requires all three states to
be demonstrated: a companion on real time far enough away that the two lines
visibly differ, a companion on a fixed time of day, and a companion given no
user clock. Where a state has no demonstrator, propose the smallest persona
amendment that gives it one — a prompt fixing an hour that is not load-bearing
can stop fixing it.

**Hand the report over and wait.** Do not apply values or amend a persona before
Task 9 has run.

- [ ] **Step 3: Apply the agreed values**

Set the three fields on each built-in in `src/lib/companions/companions.ts`, and
add them to each `goonpacks/*/manifest.json`. Make any persona amendment that
Task 9 approved.

- [ ] **Step 4: Write the test that a built-in's zone is real**

Add to `src/lib/companions/companions.test.ts`:

```ts
it('gives every built-in on real time a zone this runtime can render', () => {
  for (const companion of Object.values(COMPANIONS)) {
    if (!companion.usesRealTime) continue;
    expect(companion.timezone).toBeDefined();
    expect(
      () => new Intl.DateTimeFormat('en-GB', { timeZone: companion.timezone }),
    ).not.toThrow();
  }
});
```

- [ ] **Step 5: Verify every pack still builds**

Run: `npm run goonpack:build` Expected: every pack source under `goonpacks/`
validates. A pack that now fails is one whose manifest needs its new fields.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run format
git add src/lib/companions/ goonpacks/
git commit -m "Give every companion in the app's directories a clock"
```

---

### Task 9: The manual audit

**Files:** none.

- [ ] **Step 1: Hand Task 8's report over for a manual pass**

Task 8's report is read by hand against each companion's system prompt,
confirming the set covers all three states.

**This is a gate.** A value contradicting its own persona surfaces as a
companion behaving oddly rather than as an error, so nothing is played until
this pass has run. Do not start a session with any companion before it.

---

### Task 10: The documentation

**Files:**

- Modify: `GOONPACKS.md` (the companion section's fields; the Overlays section)
- Modify: `CHANGELOG.md`
- Delete: `docs/specs/2026-07-31-companion-time-zones.md`
- Modify: `TODO.md` (remove the `Companion time zones` entry)

- [ ] **Step 1: Document the three fields for pack authors**

In `GOONPACKS.md` → The companion section — their fields, add entries for
`timezone`, `usesRealTime` and `knowsUserTime`. Between them they must carry
what the spec's **Documentation** section lists: what each field does and which
a pack has to supply, that a zone is where the companion is now rather than
where they are from, that a persona may fix its own time of day and
`usesRealTime: false` is how an author says so, that `MY TIME` never names a
place, and what `knowsUserTime: false` is for. Link the example pack's system
prompt on GitHub as the worked case of a fixed time of day.

- [ ] **Step 2: Write the comments the spec maps to definition sites**

Confirm each is present, since the spec is about to be deleted: `describeClock`
(why the zone is required, why `hourCycle: 'h23'`), `liveStateMessage` (why an
object, what an absent member means), the three clock sections (which lines each
describes), `Companion.timezone` (why the type allows a pair validation
refuses), and `parsePack`/`library.ts` (why the same rule is checked in both).
Tasks 1, 2, 3, 5 and 6 write these; this step reads them back.

- [ ] **Step 3: Write the changelog entry**

One entry for the feature, under today's date, tagged `feature`, in the format
CLAUDE.md → Changelog sets. Describe what the app does, not how it is built.

- [ ] **Step 4: Delete the spec and its TODO entry**

```bash
git rm docs/specs/2026-07-31-companion-time-zones.md
```

and remove `### Companion time zones` from `TODO.md`. Leave
`### The user's own time zone`, which this work does not do.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run format
git add GOONPACKS.md CHANGELOG.md TODO.md docs/
git commit -m "Document the clock fields for pack authors"
```

---

## Before the PR

The gates in CLAUDE.md → Git workflow, in order: `npm run typecheck`, `lint`,
`format` clean, `npm test` and `npm run test:e2e` both run, the changelog entry
written, then `/code-check`, `/test-check`, `/doc-check`, `/style-check`,
`/personal-check`.

`/personal-check` matters more than usual here: this branch writes real
locations into `src/lib/companions/` and `goonpacks/*/manifest.json`, and the
personas those come from are the app's own content.
