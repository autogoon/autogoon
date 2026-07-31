# Companion time zones

Design for the TODO.md → Companions entry of the same name, settled 2026-07-31.
The implementation plan is separate.

## The problem

Every clock value the app puts in front of a companion is computed from the
browser's zone. A persona written as living abroad is told the user's clock and
nothing about its own, so anything it says about local time is invented or
worked out from an offset. Models get offsets roughly right and DST transitions
wrong.

## What ships

An optional IANA `timezone` in a pack's `companion` section. Set, it adds a
second TIME line carrying that companion's own local time beside the user's.
Absent, nothing changes.

## Decisions

### The zone is where they are now

Not where they are from. A persona's home is stated in its prompt and stays
there. An overlay that moves the companion sets its own `timezone`, and needs no
other change.

### Overlays may set it

`name` and `gender` are the only fields an overlay may never change. `timezone`
resolves like `description`: the overlay's value applies while that overlay is
selected. A holiday pack requires this. Such a pack carries the same persona
elsewhere, with its own prompt and its own media.

An overlay can set a zone but not clear one. Every overlay field resolves that
way already (GOONPACKS.md → Overlays), so `timezone` needs no rule of its own.

### The second line does not name the place

It reads `TIME (yours, right now)`. A companion's whereabouts belong to the
persona prompt, which may state them or leave them out. A persona that withholds
them still gets a correct clock. An IANA zone is not a location in any case: it
is named for one city and covers a region.

### A positional argument never defaults; a bag member may be absent

`describeClock(at, timeZone)` requires both. A defaulted zone would leave the
caller unable to tell which clock it received without reading the body.

`fillSharedSections` and `liveStateMessage` take objects, and a member of one
may be absent. An absent member is visible where the call is written, and it
records a fact about the companion instead of substituting a value.

A name carries its owner wherever the value leaves the object that identified
it: `companionTimeZone`, `userNow`, `companionNow`. `describeClock`'s parameter
stays `timeZone`, because its call sites supply the owner. The manifest field
stays `timezone`, because it sits inside `companion`.

## The app's own companions

Every companion in the app's own directories gets a zone: the built-ins in
`src/lib/companions/`, and every pack source under `goonpacks/`. Each value is
what that persona's prompt already states about where it lives. The values sit
at their definition sites.

A persona that states no place gets no zone.

## The data path

`CompanionConfig` and `COMPANION_FIELDS` (`src/lib/goonpacks/manifest.ts`) gain
`timezone`. `parseManifest` validates it by constructing an
`Intl.DateTimeFormat` for the zone and collecting a problem when that throws,
which accepts exactly the zones the renderer accepts on that runtime. A regex
accepts zones the renderer rejects; `Intl.supportedValuesOf('timeZone')` omits
aliases the renderer accepts. An empty string is already refused for every
manifest field.

`Companion` (`src/lib/companions/companions.ts`) gains an optional `timezone`,
and its absence is what suppresses the second line. `packToCompanionRaw` leaves
it absent rather than defaulting, as it does for `media` and `mediaSummary`.
`applyOverlay` resolves it against the base like every other field it resolves.

## The prompt path

`describeClock` takes its parts from `Intl.DateTimeFormat.formatToParts` instead
of the local-zone getters, and feeds the existing manual assembly unchanged.
That assembly is manual so the string's shape cannot drift with the ICU version,
and that reason still holds. `formatToParts` is asked for `hourCycle: 'h23'`:
under some ICU versions `hour12: false` yields 24 for midnight, which the
existing arithmetic renders as `12 pm`. A `browserTimeZone()` beside it wraps
`Intl.DateTimeFormat().resolvedOptions().timeZone`.

`liveStateMessage` takes an object of `userNow`, `companionNow` and `toyStatus`
rather than three positional strings, which can be transposed without a type
error. `companionNow` is the optional member. Absent, one TIME line is emitted.
Present, it adds the second, above TOY STATUS.

`TIME_SECTION` remains a constant appended to every prompt. Its first bullet
refers to "the TIME line you are given", which a located companion receives two
of, so it is amended to name the one it means. A second block, appended by
`fillSharedSections` only when `companionTimeZone` is present, explains the
second line and carries the rule the TODO entry asks for: their clock shows up
in what they say. `fillSharedSections` runs once per companion in `resolve.ts`,
so nothing volatile enters the persona prompt.

## Tests

- `describeClock` — the three existing cases become fixed epoch plus fixed zone,
  which also makes them independent of the machine's own zone; a pair either
  side of a DST transition; one instant rendered in two zones.
- `parseManifest` — a valid zone, an invalid one reported by name, a zone on an
  overlay.
- `applyOverlay` — an overlay's zone wins; a base's survives an overlay that
  sets none.
- `liveStateMessage` — one TIME line without `companionNow`, two with it.
- `fillSharedSections` — the second block present only when `companionTimeZone`
  is.
- Each built-in — its zone constructs a formatter. A pack's zone needs no test:
  `parseManifest` refuses an invalid one, and `npm run goonpack:build` runs that
  check over every pack source.

## Out of scope

- Clearing a zone from an overlay.
- Anything outside the prompt reading the zone. The transcript's timestamps and
  date headers stay the user's.
