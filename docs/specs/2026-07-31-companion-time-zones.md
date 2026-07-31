# Companion time zones

Design for the TODO.md → Companions entry of the same name, settled 2026-07-31.
The implementation plan is separate.

## The problem

A companion is given the time where the user is. They are given nothing about
the time where they are, so a persona written as living elsewhere has no basis
for anything they say about their own clock. Supplying an offset instead would
not fix that: a model's offset arithmetic is unreliable across a DST transition.

## What ships

Three fields in a pack's `companion` section.

`timezone`, an IANA zone. It adds a second TIME line carrying that companion's
own local time beside the user's.

`usesRealTime`, defaulting to `true`. Set to `false`, no clock is computed for
that companion and their prompt supplies whatever time it says. A companion that
uses real time needs a `timezone`.

`knowsUserTime`, defaulting to `true`. Set to `false`, the user's TIME line is
left out of that companion's prompt.

## Decisions

### The zone is where they are now

Not where they are from. A persona's home is stated in their prompt and stays
there. An overlay that moves the companion sets its own `timezone`, and needs no
other change.

### Overlays may set all three

`name` and `gender` are the only fields an overlay may never change. All three
new fields resolve like `description`: the overlay's value applies while that
overlay is selected. A holiday pack requires this of `timezone`. Such a pack
carries the same persona elsewhere, with its own prompt and its own media.

An overlay can set a field but clear none, which is how every overlay field
already resolves (GOONPACKS.md → Overlays). That is why the state an author
would otherwise express by omission is a flag instead.

### A persona may fix its own time of day

A persona prompt can assert a time of day, such as a scene that always happens
late at night. Giving that companion a real clock puts two times in one prompt,
and they contradict each other.

`usesRealTime: false` says the persona's own time is fictional. It defaults to
`true`, and a companion that uses real time needs a `timezone`, so a pack states
which of the two it is rather than implying it by leaving a field out.

The flag exists because absence could not carry that meaning. An overlay may set
a field but never clear one. If omitting `timezone` were how an author said
"fixed time", an overlay on a base that has a zone could never say it, and that
state would be unreachable for overlays entirely. The flag is settable by an
overlay like any other field, which reaches what omission cannot.

### A companion may be given no user clock

A persona who has never met the user has no reason to know what time it is where
they are. `knowsUserTime: false` keeps the user's TIME line out of that
companion's prompt.

The field is independent of the other two. A companion may be given no clock of
their own and no user clock at once, which is a persona whose prompt supplies
its own time talking to someone whose whereabouts they have no way of knowing.

### The second line does not name the place

It reads `MY TIME (right now)`. A companion's whereabouts belong to the persona
prompt, which may state them or leave them out. A persona that withholds them
still gets a correct clock. An IANA zone is not a location in any case: it is
named for one city and covers a region.

## The app's own companions

Every companion in the app's own directories takes values here: the built-ins in
`src/lib/companions/`, and every pack source under `goonpacks/`. Each one's
values come from reading their persona, and the values sit at their definition
sites. Between them they must demonstrate every state:

- a companion on real time, placed far enough from the user that the two TIME
  lines visibly differ;
- a companion on a fixed time of day;
- a companion given no user clock.

Two things can go wrong, and both are settled before anything is played. A value
can contradict the persona it is applied to, such as a real clock under a prompt
that already says what time it is. Or the set can leave a state with no
demonstrator. Where either happens a persona is amended rather than the state
left uncovered: a prompt that fixes an hour for no reason can stop fixing it.

A contradiction of that kind surfaces as a companion behaving oddly rather than
as an error, so the pass is made deliberately and then repeated by hand.

## The data path

`CompanionConfig` and `COMPANION_FIELDS` (`src/lib/goonpacks/manifest.ts`) gain
all three. `parseManifest` validates the zone by constructing an
`Intl.DateTimeFormat` for it and collecting a problem when that throws, which
accepts exactly the zones the renderer accepts on that runtime. A regex accepts
zones the renderer rejects; `Intl.supportedValuesOf('timeZone')` omits aliases
the renderer accepts. The two flags are checked for being booleans, like
`passesReasoning`. An empty string is already refused for every manifest field.

That a companion on real time has a zone is a second check, and it needs two
homes because an overlay may rely on its base for the value. `parsePack`
requires the zone on a complete pack that does not set `usesRealTime: false`,
beside the existing rules for `name`, `voiceId` and `description`. `library.ts`
reports a _resolved_ companion that uses real time with no zone as incompatible,
with the reason, which is the arrangement it already uses for every cross-pack
failure.

`Companion` (`src/lib/companions/companions.ts`) gains an optional `timezone`
and the two flags, defaulted in `packToCompanionRaw` as every other flag is.
`applyOverlay` resolves all three against the base. The type does not make the
invalid pair unrepresentable: `applyOverlay` builds by spreading the base, which
a discriminated union does not survive.

## The prompt path

`describeClock(at, timeZone)` takes a required zone, and its parts from
`Intl.DateTimeFormat.formatToParts` instead of the local-zone getters. The
existing manual assembly is unchanged. That assembly is manual so the string's
shape cannot drift with the ICU version, and that reason still holds.
`formatToParts` is asked for `hourCycle: 'h23'`: under some ICU versions
`hour12: false` yields 24 for midnight, which the existing arithmetic renders as
`12 pm`. A `browserTimeZone()` beside it wraps
`Intl.DateTimeFormat().resolvedOptions().timeZone`.

`liveStateMessage` takes an object of `userNow`, `companionNow` and `toyStatus`
rather than three positional strings, which can be transposed without a type
error. `userNow` and `companionNow` are both optional, and each emits its TIME
line when present. A companion with neither gets no TIME line, and TOY STATUS
alone.

Ownership moves into the label, where it cannot be skipped:

    MY TIME (right now): Saturday 1 August 2026, 4:11 pm
    THEIR TIME (right now): Saturday 1 August 2026, 12:11 am
    TOY STATUS (trust this over everything else): …

`TIME_SECTION` and `CONTROL_SECTION` refer to these labels by name
(`shared-prompt.ts:217`), so the rename lands in both in the same change.

`TIME_SECTION` remains a constant appended to every prompt. Its first bullet
refers to "the TIME line you are given", which is wrong for a companion sent two
and for one sent none, so it is amended to describe whichever lines arrive. A
second block, appended by `fillSharedSections` when the companion is on real
time, explains the second line and carries the rule the TODO entry asks for:
their clock shows up in what they say. `fillSharedSections` runs once per
companion in `resolve.ts`, so nothing volatile enters the persona prompt.

## Tests

- `describeClock` — the three existing cases become fixed epoch plus fixed zone,
  which also makes them independent of the machine's own zone; a pair either
  side of a DST transition; one instant rendered in two zones.
- `parseManifest` — a valid zone, an invalid one reported by name, a zone on an
  overlay, and a non-boolean flag reported.
- `parsePack` — a complete pack on real time with no zone refused; the same pack
  with `usesRealTime: false` accepted.
- `library.ts` — an overlay setting `usesRealTime: true` over a base with no
  zone listed incompatible with the reason; the same overlay supplying its own
  zone accepted.
- `applyOverlay` — an overlay's zone wins; a base's survives an overlay that
  sets none; both flags resolve the same way.
- `liveStateMessage` — each of the four combinations of the two optional
  members, including the one that emits no TIME line at all.
- `fillSharedSections` — the second block present only when `companionTimeZone`
  is.
- Each built-in that carries a zone — it constructs a formatter. A pack's zone
  needs no test: `parseManifest` refuses an invalid one, and
  `npm run goonpack:build` runs that check over every pack source.

## Documentation

This spec is deleted once the work lands, so every reason it records has to
exist somewhere permanent first. They divide by audience.

GOONPACKS.md carries what a pack author decides:

- what each field does, and which of them a pack has to supply;
- that a zone is where the companion is now, not where they are from, so an
  overlay that moves them sets its own;
- that a persona may fix its own time of day, and that `usesRealTime: false` is
  how an author says so. The committed example pack is the case, and its system
  prompt is linked on GitHub: that doc is written for people who read prompts;
- that the second TIME line never names a place, leaving a persona's whereabouts
  theirs to state or withhold;
- what `knowsUserTime: false` is for, and that a companion may end up with
  neither clock.

Comments at the definition sites carry what a maintainer needs:

- `describeClock` — why the zone argument is required rather than defaulted, and
  why `hourCycle: 'h23'`;
- `liveStateMessage` — why it takes an object, and what an absent member means;
- `TIME_SECTION` and the block appended beside it — which lines each describes;
- `Companion.timezone` — why the type allows a pair that validation refuses;
- `parsePack` and `library.ts` — why the same rule is checked in both.

## Out of scope

- Anything outside the prompt reading the zone. The transcript's timestamps and
  date headers stay the user's.
