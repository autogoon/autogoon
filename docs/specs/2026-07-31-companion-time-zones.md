# Companion time zones

Design for the TODO.md → Companions entry of the same name, settled 2026-07-31.
The implementation plan is separate.

## The problem

A companion is given the time where the user is, and nothing about the time
where the companion is. A persona written as living elsewhere therefore has no
basis for anything said about that companion's own clock. Supplying an offset
instead would not fix that: a model's offset arithmetic is unreliable across a
DST transition.

## What ships

Three fields in a pack's `companion` section.

`timezone`, an IANA zone. It adds a second TIME line carrying that companion's
own local time beside the user's.

`usesRealTime`, defaulting to `true`. Set to `false`, no clock is computed for
that companion, and the persona prompt supplies whatever time it says. A
companion that uses real time needs a `timezone`.

`knowsUserTime`, defaulting to `true`. Set to `false`, the user's TIME line is
left out of that companion's prompt.

## Decisions

### The zone is where the companion is now

Not where the companion is from. A persona's home is stated in the persona
prompt and stays there. An overlay that moves the companion sets its own
`timezone`, and needs no other change.

### Overlays may set all three

`name` and `gender` are the only fields an overlay may never change. All three
new fields resolve like `description`: the overlay's value applies while that
overlay is selected. A holiday pack requires this of `timezone`. Such a pack
carries the same persona elsewhere, with its own prompt and its own media.

An overlay can set a field but clear none, which is how every overlay field
already resolves (GOONPACKS.md → Overlays).

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
overlay like any other field.

### A companion may be given no user clock

A persona who has never met the user has no reason to know what time it is where
the user is. `knowsUserTime: false` keeps the user's TIME line out of that
companion's prompt.

The field is independent of the other two. A companion may be given no clock of
the companion's own and no user clock at once: a persona whose prompt supplies
its own time of day, talking to a user whose whereabouts that persona has no way
of knowing.

### The second line does not name the place

It reads `MY TIME (right now)`. Where a companion is belongs to the persona
prompt, which may state the place or leave it out. A persona that leaves it out
still gets a correct clock. An IANA zone is not a location: it is named for one
city and covers a region.

## The app's own companions

Every companion in the app's own directories takes values here: the built-ins in
`src/lib/companions/`, and every pack source under `goonpacks/`. Each
companion's values come from reading that companion's persona, and each value
sits at its definition site. Across the set, every state must be demonstrated:

- a companion on real time, placed far enough from the user that the two TIME
  lines visibly differ;
- a companion on a fixed time of day;
- a companion given no user clock.

Two things can go wrong, and both are settled before anything is played. A value
can contradict the persona it is applied to, such as a real clock under a prompt
that already says what time it is. Or the set can leave a state with no
demonstrator. Where either happens a persona is amended rather than the state
left uncovered: a prompt that fixes an hour for no reason can stop fixing it.

A contradiction surfaces as a companion behaving oddly rather than as an error,
which is why the pass is run twice: once as part of the work, once by hand.

## The data path

`CompanionConfig` and `COMPANION_FIELDS` (`src/lib/goonpacks/manifest.ts`) gain
all three. `parseManifest` validates the zone by constructing an
`Intl.DateTimeFormat` for it and collecting a problem when that throws, which
accepts exactly the zones the renderer accepts on that runtime. A regex accepts
zones the renderer rejects; `Intl.supportedValuesOf('timeZone')` omits aliases
the renderer accepts. The two flags are checked for being booleans, like
`passesReasoning`. An empty string needs no check of its own: `optionalString`
already refuses one for every optional string field, `timezone` among them.

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

`liveStateMessage` takes an object of `userNow`, `companionNow` and `toyStatus`.
Three positional strings could be transposed without a type error. `userNow` and
`companionNow` are both optional, and each emits its TIME line when present. A
companion with neither gets no TIME line, and TOY STATUS alone.

Ownership moves into the label, where it cannot be skipped:

    MY TIME (right now): Saturday 1 August 2026, 4:11 pm
    THEIR TIME (right now): Saturday 1 August 2026, 12:11 am
    TOY STATUS (trust this over everything else): …

`TIME_SECTION` splits into three constants, each appended by
`fillSharedSections` only when the line it describes is sent:

- `USER_CLOCK_SECTION`, for `THEIR TIME`;
- `COMPANION_CLOCK_SECTION`, for `MY TIME`, carrying the rule the TODO entry
  asks for: the companion's own clock shows up in what the companion says;
- `CONVERSATION_GAPS_SECTION`, for the `(3 hours pass.)` marker, which is about
  breaks in the conversation rather than either clock and is always sent.

One block naming both lines would tell a companion who is not given the user's
clock how to read a line they never get. `TIME_SECTION` covered two unrelated
subjects under one name, which is what let that happen.

`fillSharedSections` runs once per companion in `resolve.ts`, so nothing
volatile enters the persona prompt. `CONTROL_SECTION` names TOY STATUS, which
does not change.

## Tests

- `describeClock` — the existing cases become fixed epoch plus fixed zone, which
  also makes them independent of the machine's own zone; a pair either side of a
  DST transition; one instant rendered in two zones.
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
- `fillSharedSections` — each clock section present only when the line it
  describes is sent.
- Each built-in that carries a zone — it constructs a formatter. A pack's zone
  needs no test: `parseManifest` refuses an invalid one, and
  `npm run goonpack:build` runs that check over every pack source.

## Documentation

This spec is deleted once the work lands, so every reason it records has to
exist somewhere permanent first.

GOONPACKS.md carries what a pack author decides:

- what each field does, and which of them a pack has to supply;
- that a zone is where the companion is now, not where the companion is from, so
  an overlay that moves the companion sets its own;
- that a persona may fix its own time of day, and that `usesRealTime: false` is
  how an author says so. The committed example pack is the case, and its system
  prompt is linked on GitHub: that doc is written for people who read prompts;
- that `MY TIME` never names a place, leaving where the companion is for the
  persona prompt to state or leave out;
- what `knowsUserTime: false` is for, and that a companion may end up with
  neither clock.

Comments at the definition sites carry what a maintainer needs:

- `describeClock` — why the zone argument is required rather than defaulted, and
  why `hourCycle: 'h23'`;
- `liveStateMessage` — why it takes an object, and what an absent member means;
- the three clock sections — which line each describes, and when each is sent;
- `Companion.timezone` — why the type allows a pair that validation refuses;
- `parsePack` and `library.ts` — why the same rule is checked in both.

## Out of scope

- Anything outside the prompt reading the zone. The transcript's timestamps and
  date headers stay the user's.
