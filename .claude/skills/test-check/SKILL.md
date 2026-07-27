---
name: test-check
description:
  Use before opening a PR and again before merging it, or whenever a branch adds
  or changes tests — checks that each test would fail if the behaviour it names
  broke, that anything the branch added with a job to do is exercised at all,
  and that no test is really asserting its own fake.
---

# Test check

Verify the branch's tests would actually fail if the behaviour they name broke.
Tests are a floor, not the whole gate (CLAUDE.md → Verifying changes); this
skill checks the floor is real. A test that cannot fail is worse than no test —
it reads as coverage in exactly the place you would stop looking.

## Scope

- **Default: the branch.** `git diff main...HEAD --name-only` gives you three
  things to review: every `*.test.ts` and `tests/e2e/*.spec.ts` the diff
  touched; the source modules those tests cover; and every new or changed export
  under `src/lib/**`, whether or not it has a test.
- **`/test-check all`: full sweep.** Every test file against its source. Fan out
  one subagent per file or tight cluster — each needs room to read the source
  and run mutations. Expensive; this is not the per-PR mode.
- **Always read the source.** Never review a test in isolation from the code it
  tests. Most findings only exist in the gap between the two.

## What earns a test

**A test should fail only when something is broken — never merely because you
changed your mind.** That one line decides most of what follows.

| Test                                         | Fails when           | Verdict |
| -------------------------------------------- | -------------------- | ------- |
| "the reset button says 'Reset'"              | you rename the label | no      |
| "pressing reset resets"                      | reset stops working  | yes     |
| "the program dips to 0"                      | you retune the floor | no      |
| "generating a program yields a playable one" | generation breaks    | yes     |

**Test that a unit does its job, not the values it happens to use today.** The
play-mode engines (`src/lib/play-modes/*-engine.ts`) generate randomised
programs whose curves are tuned by hand and change often, so their job is that
building a program works and playing it works: the look-ahead progress
guarantee, event ordering, state transitions (`reset`, `beginCumming`,
after-play selection), one-shot guards, `unscaled` bypassing the intensity
ceiling. Dip floors, ramp curves, speed at a given clock and thresholds measured
off today's output are detail — they fail when someone tunes a knob, and say
nothing about whether generation works.

**So assert a value only where you are not free to change it.** User-facing
strings, wire and file formats, protocol headers and persisted shapes all
qualify — and so does `autopilot-engine.ts`, which is not an exception but a
consequence: it reimplements an external algorithm that does not change, so its
numbers are a specification, recorded in
[modes/AUTOPILOT.md](../../../modes/AUTOPILOT.md). Testing them makes that
record executable.

**A module with a job and nothing exercising it is a finding** — any new or
changed module under `src/lib/**`, I/O or not. Doing I/O changes _how_ you test
something, never _whether_: put a fake at the boundary (`library.test.ts`'s
in-memory `source()` is the pattern here) or cover it in `tests/e2e/`. This is
the check most likely to earn its keep on a PR, because nothing else looks for
it.

## Fakes

A fake stands at a boundary for one of two reasons: so the test can assert
**what the code sent** across it (the API key, the model, the access header, the
abort signal), or so a module that needs storage or a clock can run at all
(`library.test.ts`'s in-memory `source()`).

**Never fake the AI services.** The app always has LLM, TTS and STT available,
so a canned reply standing in for a real one proves nothing about the thing you
care about — exercise those in `tests/e2e/`.

**A fake may supply the input; the assertion must be on something the code under
test decided.** The check: _if the code under test were replaced by a
pass-through, would this still pass?_ If yes, the test is asserting its own
fixture and is a dud.

The distinction is sharper than it sounds. A fake upstream returning a 429 so
the route can be seen turning it into a 502 is sound — the status, and the
decision not to stream an error body, are the route's. A fake returning
`{ token: 'x' }` where the test asserts `{ token: 'x' }` is not: a route that
forwarded the whole upstream body unchanged would pass it just as well.

Watch for the quieter forms: a fake whose method is a pure function of its
arguments, so a memoised call and an unmemoised one are indistinguishable; a
fake that discards a constructor argument, so the secret it was handed is never
observed; expected and actual both derived from the same source, so the test
mirrors whatever that source says.

## Testing LLM responses

Assert the contract, never the prose. A reply's wording is not a contract; its
shape is. Worth pinning: that a tool call parses and names a real tool, that the
tool actually ran, that the projected wire messages carry only what the model
should see, that a cached prompt prefix holds nothing that changes per turn. For
anything about content, assert only invariants that hold for any sane reply
(valid JSON, a required field present, a forbidden string absent) and say in a
comment what flake rate you accepted and how you measured it.

## What to check, per test file

1. **Can it fail?** For any test naming a specific bug or contract, prove it —
   see Mutation testing below. Prefer proof to reading; this repo has shipped
   tests that passed identically with and without the fix.
2. **Vacuity by other means** — assertions inside a loop over a collection that
   can be empty; `.every(...)` over an array a defect empties; `toBeDefined()` /
   `toBeTruthy()` where the contract is a value; an assertion restating the
   arrange step; an assertion entailed by the one above it.
3. **Names stand alone.** `describe` is the bare exported symbol; `it` is a
   third-person sentence carrying its condition as a clause, so the two read as
   prose. Use real identifiers and constants. Never name the assertion's shape.
   No name defined by exclusion ("otherwise", "anything else", "the rest"), and
   none that only parses beside a neighbour ("still", "shorter", a mechanism in
   parentheses).
4. **"and" in a name** — a signal, not a rule. Split when it joins two unrelated
   behaviours; leave it when the compound is one behaviour ("trims and
   lowercases", "401s and never calls upstream").
5. **Comments earn their place** in four situations: a file header saying what
   this file decides and what it delegates; a fixture whose odd shape needs
   justifying; a regression test, naming the defect; a cast inside a fake.
   Delete any comment that restates the name, narrates the assertion below it,
   or explains mechanics the code already shows.
6. **Every factual claim in a comment is true.** Verify against the source and
   quote `file:line` for each correction. Comments asserting behaviour the code
   does not have are the failure mode here, and they are always written
   confidently. Present tense throughout; a regression states the bug's return
   as a counterfactual ("would forge"), never as history.
7. **A skip is not a pass.** Where a capability probe can skip a whole suite
   (`tests/e2e/opfs.ts`), say what a green run did not cover.

## Mutation testing

**A mutant is a deliberately broken copy of the code under test** — one specific
thing changed, nothing else. Run the tests against it. If one fails, the suite
would catch that bug for real: the mutant is _killed_. If they all pass, the
code is broken and nothing noticed — the mutant _survived_, and whatever test
claimed to cover that behaviour does not.

Copy the module to the scratchpad, reintroduce the defect **there**, point a
copy of the test at it, and confirm the test fails. Then restore and confirm the
real suite passes.

- **Never mutate a file in the repo.** Mutation residue has reached `src/`
  before now. Afterwards, confirm `git diff` on every source file is empty.
- A jest timeout **cannot** preempt a synchronous infinite loop — the process
  dies on an OOM minutes later. Do not rely on one to fail fast.
- Budget it. Per-PR, mutate only tests the diff added or changed, and tests
  whose named contract the diff touches.

## Removing a test

**If the test is not testing anything, remove it.** Do not nurse a vacuous test
by patching its fixture to keep the name. Delete outright when it is a
tautology, a duplicate, or restates its fixture. Where the underlying contract
genuinely matters, delete it and write a real one named for what it now pins —
the result is a new test that bites, not an old one with a patch. Never leave a
contract that matters with no coverage.

## Output and fixes

Report per file, only where there is something to say: the **name** (current,
why it fails the standard, proposed replacement); the **comment** (quoted,
verdict, `file:line` evidence, rewrite or deletion); the **gap** (what cannot
fail, or what has no test, and exactly what you did to establish it). Then a
summary: which files are clean, which need work, anything systemic.

- **Fix directly:** names, comments, deletions of tests that cannot fail, and
  repairs to a guard that has gone quiet — restoring what a test already claims
  to pin is accuracy, not new coverage.
- **Ask first:** splitting tests, and genuinely new coverage — a contract
  nothing pinned before.

**Ask one thing at a time.** Never close a report with a blanket "shall I do
these?". Take the recommendations in order and, for each, ask a question naming
that one change and what it would assert — then stop and wait. Someone who has
just read a page of findings cannot hold five decisions at once, and a digest
followed by one open question is unanswerable. If the report ran long, restate
the single change in the question rather than pointing back at it.

Run `npm run format` after edits, and `npm test` before reporting done. A clean
run reports "no findings" — don't invent findings to seem useful.

## Red flags

| Thought                               | Reality                                                                |
| ------------------------------------- | ---------------------------------------------------------------------- |
| "The suite is green, so it's covered" | Green is what a test that cannot fail looks like. Mutate it.           |
| "That comment reads authoritatively"  | So did the false ones. Check it against the source.                    |
| "Reading it is enough"                | Reading found none of the duds in this repo. Run the mutation.         |
| "This assertion is obviously right"   | Trace the value. If the fake supplied it, the test proves nothing.     |
| "A number makes the test precise"     | Precise about a curve you tune next week. Test the behaviour instead.  |
| "It's only a test file"               | A wrong test is a wrong claim about the code, with a green tick on it. |
