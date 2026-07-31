# Companion time zones

Design for the TODO.md → Companions entry of the same name, settled 2026-07-31.
The implementation plan is separate.

## The problem

A companion is given the time where the user is. They are given nothing about
the time where they are, so a persona written as living elsewhere has no basis
for anything they say about their own clock. Supplying an offset instead would
not fix that: a model's offset arithmetic is unreliable across a DST transition.

## What ships

Two optional fields in a pack's `companion` section.

`timezone`, an IANA zone. Set, it adds a second TIME line carrying that
companion's own local time beside the user's. Absent, nothing changes.

`knowsUserTime`. Set to `false`, the user's TIME line is left out of that
companion's prompt.

## Decisions

### The zone is where they are now

Not where they are from. A persona's home is stated in their prompt and stays
there. An overlay that moves the companion sets its own `timezone`, and needs no
other change.

### Overlays may set both

`name` and `gender` are the only fields an overlay may never change. Both new
fields resolve like `description`: the overlay's value applies while that
overlay is selected. A holiday pack requires this of `timezone`. Such a pack
carries the same persona elsewhere, with its own prompt and its own media.

An overlay can set either field but clear neither. Every overlay field resolves
that way already (GOONPACKS.md → Overlays), so neither needs a rule of its own.

### A persona may fix its own time of day

A persona prompt can assert a time of day, such as a scene that always happens
late at night. Giving that companion a `timezone` puts a real clock in the same
prompt as the fixed one, and the two contradict each other.

Omitting the zone is how an author says the persona's own time is fictional.
That is why `timezone` is optional rather than required.

### A companion may be given no user clock

A persona who has never met the user has no reason to know what time it is where
they are. `knowsUserTime: false` keeps the user's TIME line out of that
companion's prompt.

The field is independent of `timezone`. Either may be set without the other, and
a companion with neither is given no clock at all. Nothing rejects that
combination: a persona whose prompt fixes a time of day supplies its own, and
whether that is what the author wrote is not something the manifest can tell.

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

Every companion in the app's own directories is settled here: the built-ins in
`src/lib/companions/`, and every pack source under `goonpacks/`. A companion
takes a zone when their prompt states where they live and does not fix a time of
day, and the value is what that prompt already says. The values sit at their
definition sites.

Between them they demonstrate all three states, which is why no new companion is
written for this:

- a zone set, on a built-in placed far enough from the user that the two TIME
  lines visibly differ;
- no zone, on the pack whose persona is built around a fixed late-night scene;
- `knowsUserTime: false`, on that same pack, whose persona talks to someone
  whose whereabouts they would have no way of knowing.

## The data path

`CompanionConfig` and `COMPANION_FIELDS` (`src/lib/goonpacks/manifest.ts`) gain
`timezone` and `knowsUserTime`. `parseManifest` validates the zone by
constructing an `Intl.DateTimeFormat` for it and collecting a problem when that
throws, which accepts exactly the zones the renderer accepts on that runtime. A
regex accepts zones the renderer rejects; `Intl.supportedValuesOf('timeZone')`
omits aliases the renderer accepts. `knowsUserTime` is checked for being a
boolean, like `passesReasoning`. An empty string is already refused for every
manifest field.

`Companion` (`src/lib/companions/companions.ts`) gains an optional `timezone`,
and its absence is what suppresses the second line. `packToCompanionRaw` leaves
it absent rather than defaulting, as it does for `media` and `mediaSummary`.
`knowsUserTime` defaults to `true` there, like every other flag. `applyOverlay`
resolves both against the base like every other field it resolves.

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
error. `userNow` and `companionNow` are both optional, and each emits its TIME
line when present. A companion with neither gets no TIME line, and TOY STATUS
alone.

`TIME_SECTION` remains a constant appended to every prompt. Its first bullet
refers to "the TIME line you are given", which is wrong for a companion sent two
and for one sent none, so it is amended to describe whichever lines arrive. A
second block, appended by `fillSharedSections` when the companion has a zone,
explains the second line and carries the rule the TODO entry asks for: their
clock shows up in what they say. `fillSharedSections` runs once per companion in
`resolve.ts`, so nothing volatile enters the persona prompt.

## Tests

- `describeClock` — the three existing cases become fixed epoch plus fixed zone,
  which also makes them independent of the machine's own zone; a pair either
  side of a DST transition; one instant rendered in two zones.
- `parseManifest` — a valid zone, an invalid one reported by name, a zone on an
  overlay, and a non-boolean `knowsUserTime` reported.
- `applyOverlay` — an overlay's zone wins; a base's survives an overlay that
  sets none; `knowsUserTime` resolves the same way.
- `liveStateMessage` — each of the four combinations of the two optional
  members, including the one that emits no TIME line at all.
- `fillSharedSections` — the second block present only when `companionTimeZone`
  is.
- Each built-in that carries a zone — it constructs a formatter. A pack's zone
  needs no test: `parseManifest` refuses an invalid one, and
  `npm run goonpack:build` runs that check over every pack source.

## Documentation

GOONPACKS.md gains both fields. Beyond describing them it has one thing to
explain: a persona may fix its own time of day, and omitting `timezone` is how
an author says so. The committed example pack is the case to point at, and its
system prompt can be linked on GitHub — that doc is written for pack authors,
who read prompts.

## Out of scope

- Clearing a zone from an overlay.
- Anything outside the prompt reading the zone. The transcript's timestamps and
  date headers stay the user's.
