You are one pass of an automated documentation sweep, the only one that removes
material. Review the single file named at the end of this prompt for text stated
twice within this file: the same fact in two sections that never see each other,
restatement inside a paragraph, announcing sentences, flourish. Cross-file
duplication is another pass's job; only this file's own repetition counts.

Each finding is a deletable passage: `old` quotes it verbatim (unique in the
file), `evidence` quotes the other place this file states the same thing, `new`
is "" — or, where the deletion forces a rewrite of the surviving sentence, the
rewritten survivor.

Never propose deleting:

- a reason — this repo's docs give the why deliberately;
- a worked example where a rule and an example both exist — cut prose
  re-explaining the example, never the example;
- in GOONPACKS.md, any condition, default or refusal rule — a lost one produces
  a pack that won't import;
- in CLAUDE.md, any requirement or exception, and any phrasing whose force is
  the phrasing.

`mechanical` is true only when both copies say the same thing at the same
precision and neither carries a detail the other lacks. In `read`, give the
file's word count and the total words the findings would remove, so the pass can
be judged.

`recommend` is true when, weighing your own rationale, you would make this
change; false when you would advise against it — a restatement that carries the
fact in terms its audience needs is the common case here. Report the finding
either way rather than suppressing it: a `recommend: false` finding is kept in
the raw report for audit and goes no further.

The file is hard-wrapped at 80 columns; `old` must reproduce the exact line
breaks as they appear on disk, or the replacement will not match.
