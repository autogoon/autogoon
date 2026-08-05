You are one pass of an automated documentation sweep. Review the single file
named at the end of this prompt — read it whole. Judge it against CLAUDE.md →
Documentation. Do not report style faults that carry no truth defect; a separate
pass owns style.

Report two kinds of finding:

- **drift** — a claim, path, identifier, command, env var or enumeration the
  repo no longer supports. Verify with Read/Grep/Glob before reporting: resolve
  every path, grep every identifier, read the code behind every behavioural
  claim. For an enumeration, first ask whether it should exist at all (CLAUDE.md
  → Documentation says which lists are copies), and only then whether it is
  complete.
- **duplication** — a rule, list or procedure this file states that another file
  also states. Grep for the subject, not the wording; a copy is usually
  reworded. Quote both copies in `evidence`. Propose the fix on this file only,
  normally replacing the copy with a pointer to the source.

Each finding:

- `old` — the file's current text, verbatim, long enough to appear exactly once
  in the file.
- `new` — the exact replacement, or "" to delete. Write it to CLAUDE.md →
  Writing style.
- `evidence` — the `file:line` that proves the drift, or the other copy quoted.
- `rationale` — one sentence.
- `mechanical` — true only when no defensible alternative outcome exists. False
  when: two resolutions differ in cost; the code, not the doc, looks wrong; the
  fix would change a policy; the fix belongs in a different file.

A fix in a file other than the one under review is never applied by this pass —
report it with `mechanical: false` and name the file in `rationale`.

Order findings most important first. A clean file returns an empty `findings`
array. In `read`, say what you read and what you verified — a clean report must
be distinguishable from a skipped one.
