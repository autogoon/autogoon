# Companion time zones

A design, settled 2026-07-31, for the TODO.md → Companions entry of the same
name. It covers what ships and why each choice was made; the implementation plan
is separate.

## The problem

A pack author can place a persona anywhere, but one clock is real. The prompt's
TIME line is the browser's, so a companion written as living abroad is told the
user's time and nothing else. Asked what time it is where they are, they either
invent it or do offset arithmetic — which models are passable at and quietly
wrong about across a DST transition.

## What ships

An optional IANA `timezone` in a pack's `companion` section. When it is set, the
companion is sent a second TIME line carrying their own local time beside the
user's, computed by the app. When it is absent, every prompt and every line is
exactly what it is today.

## Decisions

### The zone is where they are now, not where they are from

Home belongs in the persona prompt. An overlay that takes a companion elsewhere
sets its own `timezone`, and the prompt still says where home is — the two never
compete, because only the zone moves.

### Overlays may set it

`name` and `gender` are the two fields an overlay may never change. `timezone`
is not one of them: it behaves like `description`, where the overlay's value
wins while that overlay is selected. The case that decides it is a holiday pack
— the same persona somewhere else, with their own prompt and their own pictures.

An overlay can set a zone but not clear one, which is how every overlay field
already works (GOONPACKS.md → Overlays). Nothing about `timezone` needs saying
on top of that.

### The second line never names the place

It reads `TIME (yours, right now)`. Where a companion is belongs to the persona
prompt, to state or to withhold, so a persona whose location is deliberately
private still gets a correct clock. Deriving a city from the zone would take
that choice away, and a zone's city is usually not where the persona lives —
`Europe/London` covers the whole of the UK.

### A positional argument never defaults; a bag member may be absent

`describeClock(at, timeZone)` takes both positionally, both required. A
defaulted zone would leave the caller unable to see which clock came back
without reading the body.

`fillSharedSections` and `liveStateMessage` take objects whose members may be
absent, which is not the same shape: an absent member is visible at the call
site, and it states a fact — this companion has no zone.

Where a zone or a formatted time leaves the object that identifies its owner,
its name carries the owner: `companionTimeZone`, `userNow`, `companionNow`.
`describeClock`'s own parameter stays `timeZone`, because its call sites name
the owner. The manifest field stays `timezone`, because it sits inside
`companion`.

## The data path

`CompanionConfig` (`src/lib/goonpacks/manifest.ts`) gains `timezone?: string`,
and `COMPANION_FIELDS` gains the key. Validation sits with the
`chattiness`/`playfulness` block and collects a problem rather than failing
alone:

```ts
if (c.timezone !== undefined) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: c.timezone as string });
  } catch {
    problems.push(
      `The timezone field must be an IANA time zone name, like "Europe/Riga".`,
    );
  }
}
```

Constructing the formatter the renderer will use is the point: a zone that
validates is a zone that renders on that runtime. A regex would accept zones the
renderer rejects, and `Intl.supportedValuesOf('timeZone')` omits aliases the
renderer accepts. An empty string is already refused by the rule that rejects
any empty manifest field.

`Companion` (`src/lib/companions/companions.ts`) gains `timezone?: string`, and
its absence is the signal that there is no second line. That follows `media` and
`mediaSummary`, which `packToCompanionRaw` already leaves absent rather than
defaulting. So it sets `timezone: c.timezone` with no `??`, and `applyOverlay`
sets `timezone: c.timezone ?? base.timezone`, matching every other field it
resolves.

## The prompt path

**The clock.** `describeClock(at: number, timeZone: string)` takes its parts
from `Intl.DateTimeFormat.formatToParts` instead of the local-zone getters, and
feeds the existing manual assembly unchanged — the assembly is manual so the
string's shape cannot drift with the ICU version, and that reason is untouched.
`formatToParts` is asked for `hourCycle: 'h23'`: `hour12: false` yields `24` for
midnight under some ICU versions, and the existing `((h + 11) % 12) + 1` would
render that as `12 pm`. A `browserTimeZone()` beside it wraps
`Intl.DateTimeFormat().resolvedOptions().timeZone`, so the user's call site
names its clock.

**The live line.** `liveStateMessage` takes an object — three positional strings
can be transposed and still typecheck:

```ts
export const liveStateMessage = ({
  userNow,
  companionNow,
  toyStatus,
}: {
  userNow: string;
  companionNow?: string;
  toyStatus: string;
}): string => …
```

An absent `companionNow` emits one TIME line exactly as today. A present one
adds the second, above TOY STATUS.

**The rules.** `TIME_SECTION` stays a constant appended to every prompt. Its
first bullet says "the TIME line you are given", which a located companion
receives two of, so it is amended to identify the one it means by its label. A
second block, appended by `fillSharedSections` only when `companionTimeZone` is
present, explains the second line and carries the rule the TODO entry asks for:
their clock shows up in what they say. `fillSharedSections` runs once per
companion in `resolve.ts`, so the zone is known at assembly and nothing volatile
enters the persona prompt — the prefix stays reusable.

## Tests

- `describeClock` — its three existing cases become fixed-epoch-plus-fixed-zone,
  which also makes them independent of the machine's own zone for the first
  time; a pair either side of a DST transition; and one instant rendered in two
  zones, differing.
- `parseManifest` — a valid zone accepted, an invalid one reported by name, and
  a zone accepted on an overlay.
- `applyOverlay` — an overlay's zone wins, and a base's survives an overlay that
  sets none.
- `liveStateMessage` — one TIME line without `companionNow`, two with it.
- `fillSharedSections` — the second block present only when `companionTimeZone`
  is.

## Out of scope

- Clearing a zone from an overlay.
- A zone on any built-in companion.
- Anything reading the zone outside the prompt: the transcript's timestamps and
  date headers stay the user's throughout.
