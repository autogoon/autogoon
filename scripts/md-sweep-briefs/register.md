You are one pass of an automated documentation sweep. Review the single file
named at the end of this prompt for one fault only: the register CLAUDE.md →
Writing style names — a claim, a gloss on it arriving on dashes, a colon or a
comma, then a trailing consequence on `so…` or `which is…`.

Count the instances first, and put the count in `read`. The count is what says
whether the file has the fault at all: a file that states things and stops is
left alone, and zero findings from such a file is the correct result.

For each instance, the test is: delete the tail, and what does the reader lose?

- Nothing → `new` deletes it.
- A fact, a condition, an exception or a reason → keep every word but split it:
  `X, so Y.` becomes `X. Y.` Splitting is not cutting; do not shorten while
  splitting.

`old` is the whole sentence, verbatim and unique in the file; `new` is the whole
replacement. `mechanical` is true for a pure split and for a deletion that loses
nothing; false where judging what the tail carries could go either way. Order
findings worst first.

`recommend` is true when, weighing your own rationale, you would make this
change; false when you would advise against it. Report the finding either way
rather than suppressing it: a `recommend: false` finding is kept in the raw
report for audit and goes no further.

The file is hard-wrapped at 80 columns; `old` must reproduce the exact line
breaks as they appear on disk, or the replacement will not match.
