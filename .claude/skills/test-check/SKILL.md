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

## What to check

**Every rule in [CLAUDE.md](../../../CLAUDE.md) → Verifying changes → What a
test is for is a check.** Read them there. They are not repeated here, so a rule
added there is checked without this file changing. The rest of § Verifying
changes — the commands, the zero-warning gate, the pre-commit run — is procedure
for the author, not something to review a branch against.

Two things that do not follow from knowing the rule:

**Would this test fail if the behaviour it names broke?** Mutation testing
answers it — § Mutation testing. Reading does not.

**Where a test asserting its own fixture hides.** CLAUDE.md carries the rule and
its pass-through check. These shapes supply the asserted value without appearing
to:

- a fake method that is a pure function of its arguments, so a memoised call and
  an unmemoised one look identical;
- a fake that discards a constructor argument, so the secret it was handed is
  never observed;
- expected and actual derived from the same source.

## Where to look

The rules are in CLAUDE.md. These are the places a breach hides, which reading
the rules would not tell you:

1. **Vacuity that isn't obvious** — an assertion inside a loop over a collection
   that can be empty; `.every(...)` over an array a defect empties;
   `toBeDefined()` / `toBeTruthy()` where the contract is a value; an assertion
   restating the arrange step; an assertion entailed by the one above it.
2. **A name that only parses beside its neighbour** — read the full `describe` +
   `it` string alone, as a CI failure list shows it, not in file order where the
   surrounding tests supply the missing context.
3. **A comment asserting behaviour the code does not have.** Verify each against
   the source and quote `file:line`. These are always written confidently, which
   is why reading past them is easy.
4. **A skip is not a pass.** Where a capability probe can skip a whole suite
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

Put those questions **one at a time** — [CLAUDE.md](../../../CLAUDE.md) → Git
workflow.

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
