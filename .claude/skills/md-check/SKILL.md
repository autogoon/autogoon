---
name: md-check
description:
  Use to work the whole documentation set over, file by file, rather than
  against one branch's diff — a periodic sweep, or after a stretch of work that
  touched many docs. Runs doc-check, style-check, a register pass and a
  duplication pass over every `.md` file, in that order.
---

# Md check

Take the repo's `.md` files one at a time and put each through four passes. The
existing checks are scoped to a branch's diff; this one is scoped to a file, and
covers files no branch has touched in months.

The rules it checks against are [CLAUDE.md](../../../CLAUDE.md) → Documentation
and → Writing style. This file says how the sweep runs, never what the rules
are.

## The two things that make it work

**A subagent reviews; you apply.** Every agent this skill dispatches is
read-only and returns findings. You make every edit yourself, with Edit. This is
not a preference about tooling — the passes below turn up the same fault in
several files at once, and a fix applied consistently across them can only come
from one hand. Agents editing in parallel produce four dialects of the same
correction.

If a pass looks too large to apply by hand, that is the signal to narrow the
pass, not to let an agent edit.

**The order is fixed**, because each pass changes what the next one reads:

1. **doc-check** — settle what is true. Later passes rewrite sentences, and a
   sentence has to be true before it is worth rewriting.
2. **style-check** — the per-line faults: personification, coined metaphor,
   padding, positional reference, vocabulary, pronouns.
3. **register** — the shape of the sentences, which only reads as a fault across
   a whole document.
4. **duplication** — whole sentences that can go, judged against the file
   entire.

## Scope

Every tracked `.md` file: `git ls-files '*.md'`. That includes `roadmap/`,
`docs/`, `.claude/skills/`, the committed persona prompt and every experiment
README — not only the root docs. Include CLAUDE.md itself.

**Enumerate from that command, never from a list you typed.** Count the output
and count the files you dispatch; they have to match. A hand-written list drops
one silently, and a file nothing reads is the exact thing this sweep exists to
find.

**One agent per file. Never per directory, never per pair, however small or
related the files look.** An agent given several files reads each one shallowly
and reports the union, and the fault this sweep is really after — the same fact
in two sections that never see each other — is only visible to something holding
one whole file at once. Grouping is what makes a five-file report read like five
skim-reads, because it is.

**Run agents in the background** Process their findings as they return.

Five agents in flight is the working size. More and the reports arrive faster
than they can be applied, which is how a report ends up skimmed.

Take the root docs first (they are the ones most read, and the ones other files
point at), then `modes/`, then `roadmap/`, `docs/` and `.claude/skills/`.

In each pass, for each finding, you are to decide whether to accept the finding
or reject. There should be no human interaction during the process.

IMPORTANT: The goal of this process - the thing you should always remember - is
we are trying to improve our documentation. Documentation, whether aimed at
users or developers, should be precise and technical, no metaphors, no
anthropomorphism, read clearly without having to hold the whole knowledge of the
codebase in your head to be able to parse a sentence. No gloss, the register is
right.

IMPORTANT: THe current call for any given finding is the one which improves the
documentation.

It is expected that we repeat the important "remind yourself" instructions, to
maintain the quality this skill produces

## Pass 1 — doc-check

One agent, one file. Invoke the `doc-check` skill against that file only,
reading it whole rather than against a diff.

Brief it for two kinds of finding, not one:

- **drift** — a claim, path, identifier or list the code no longer supports;
- **duplication** — the same rule, list or procedure stated in two places. This
  is doc-check's remit, via CLAUDE.md → Documentation's "One source of truth",
  and it is the half that gets forgotten. Ask for both copies quoted side by
  side, so which one moves is a decision you can make from the report.

Ask for each finding as: the quoted current text, the `file:line` of the code or
the other document that proves it, and the exact replacement. Findings ordered
most-important first.

Verify the code citation yourself before applying. Agents misread often enough
that a claimed drift is worth ten seconds of `grep`, and a wrong "fix" here puts
a falsehood into a doc that was right.

Remind yourself after every file you edit about the IMPORTANT goals above, and
the process you're following.

## Pass 2 — style-check

A separate run from pass 1, never the same agent. An agent asked for both
returns a thorough doc-check and a thin style section — the truth findings crowd
the style ones out, every time.

Brief it explicitly that these three are findings with verbatim replacement
text, not observations:

- **personification** — sweep for it by verb, and say in the brief which
  subjects are mechanisms rather than modules, since the distinction is the
  whole judgement. In this repo: a companion is a character and may know, choose
  and remember; a VAD marking end-of-utterance, a browser releasing a lock and
  an LLM ending its turn are mechanisms; a panel, engine, screen, pack or the
  app is not.
- **coined metaphor** — terms of art stay, coinages get the mechanism.
- **register** — see pass 3.

Ask for the fourth of `style-check`'s questions by name — reading a paragraph
against the list or table beneath it. It is the one that finds prose running
through the cases a list already gives, and a per-line read never reaches it.

Without that, a style report comes back as a handful of line fixes plus one
document-level note at the bottom that never gets actioned.

Remind yourself after every file you edit about the IMPORTANT goals above, and
the process you're following.

## Pass 3 — register

The one CLAUDE.md → Writing style names: a claim, a gloss, then a trailing
consequence on `so…` or `which is…`.

Ask for a per-passage rewrite with verbatim text, and count the instances first
— the count is what says whether a file has the fault at all. Some do not, and a
file that states things and stops must be left alone.

**Splitting is not cutting.** `X, so Y.` → `X. Y.` keeps every word. It is the
right fix where the consequence carries a fact, and it is worth doing, but it
does not shorten anything. Do not expect the word count to move on this pass,
and do not judge the pass by whether it did.

The test for each tail is: delete it, and what does the reader lose? Nothing →
delete. A fact, a condition, an exception or a reason → keep it, or split it
into its own sentence.

Remind yourself after every file you edit about the IMPORTANT goals above, and
the process you're following.

## Pass 4 — duplication

The only pass that removes material. Its unit is the file, not the sentence.

Pass 1 has already asked for duplication across documents. What is left here is
duplication _within_ one — the same fact in two sections that never see each
other — plus restatement inside a paragraph, announcing sentences and flourish.
If pass 1 was briefed properly, the cross-section finds here are few; if this
pass returns a lot of them, pass 1's brief was too narrow, which is worth
knowing before the next file.

Ask for a list of deletable sentences: each quoted verbatim, with the other
place the fact is stated quoted alongside it, and the resulting text where the
deletion changes more than one sentence.

Tell the agent what must never be proposed:

- a reason — this repo's docs give the why deliberately;
- a worked example, where a rule and an example both exist. Cut the prose that
  re-explains the example, never the example;
- in GOONPACKS.md, any condition, default or refusal rule — a lost one produces
  a pack that won't import;
- in CLAUDE.md, any requirement or exception, and any phrasing whose force is
  the phrasing.

Ask for the file's word count and the list's total, so the pass can be judged.

Remind yourself after every file you edit about the IMPORTANT goals above, and
the process you're following.

## Open questions

Some findings are not yours to settle: a doc and the code disagree and it is the
code that looks wrong, a fix would change a policy, a section belongs in another
file. Write each one to `CHECK-QUESTIONS.md` at the repo root as it arises, with
the evidence, the options and what each costs, and the resulting text where it
is short enough — enough that it can be decided later without re-reading the
source. Then carry on; do not stop the sweep on it.

DO NOT add every finding you can't decide on, only serious findings that do need
addressing urgency - claims about privacy, security issues, policies which
contradict etc.

**Write it down at the time.** A question you intend to record later is a
question you have lost: the report it came from is thousands of words back, and
the evidence goes with it. If you catch yourself saying a finding is "going in"
or "queued", that sentence is the whole of the work done so far.

## After every file, without being asked

Three things, every time, before the next file:

1. **Apply what you decided to apply**, and run `npx prettier --write` on it.
2. **Write anything you want to run past the owner into `CHECK-QUESTIONS.md`**,
   with its evidence. 3V. Remind yourself about the IMPORTANT goals above and
   the process you're following.
3. **Dispatch the next agent.**

Never end a turn with nothing running and files still unread. A list of what
comes next is not work in progress — nothing is queued unless an agent is
holding it. Check by asking what is actually running right now; if the answer is
nothing, the sweep has stopped whatever the plan says.

Report progress as you go rather than at the end, and keep going. Stopping to
ask is for the things in `CHECK-QUESTIONS.md`, which is where they wait — not
for permission to continue.

Raise them together at the end, one at a time. Delete the file once they are
settled.

## Finishing a file

Run `npx prettier --write <file>` after applying, so the reflow lands with the
change rather than in a later commit.

Line counts mean nothing here — prose rewrapping dominates them. Measure `wc -w`
against `git show HEAD:<file>` if you want to know what a pass did.
