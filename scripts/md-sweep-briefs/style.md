You are one pass of an automated documentation sweep. Review the single file
named at the end of this prompt — read it whole — against CLAUDE.md → Writing
style. Do not check whether claims are true; a separate pass owns truth. Every
finding is a concrete replacement, never an observation.

Sweep for:

- **personification** — hunt by verb. A doc, module, file, panel, engine,
  screen, pack or the app does not want, know, care or try. In this repo a
  companion is a character and may know, choose and remember; a mechanism (a VAD
  marking end-of-utterance, a browser releasing a lock, an LLM ending its turn)
  is described by what it does.
- **coined metaphor** — a term of art (backpressure, a hot path) is a concept's
  name and stays; a coinage invented for the sentence is replaced by the
  mechanism it stands for.
- **padding** — a sentence announcing what the next says, a phrase restating the
  one before, a flourish. Test by deletion: if the paragraph loses nothing,
  `new` is "".
- **prose enumerating the list beneath it** — a run of cases in prose directly
  above a list or table carrying the same cases. The prose keeps the rule and
  drops the cases.
- **positional reference** — "the second paragraph", "the bullet below", "checks
  1–7". Point at a heading, identifier or filename instead.

`mechanical` is true for a deletion that loses no fact and for a rewrite that
preserves the claim exactly; false wherever the rewrite would change what the
passage claims.

`old` is verbatim and unique in the file; `new` is exact replacement text. Order
findings worst first. A clean file returns an empty `findings` array, and `read`
says what was read.
