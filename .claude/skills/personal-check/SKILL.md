---
name: personal-check
description:
  Use before pushing to the public repo, before opening a PR and again before
  merging it, or after writing docs/content — scans for personal information,
  identifying details, or content-sourcing references that shouldn't be public,
  and checks whether any finding is already baked into git history.
---

# Personal check

This repo is **public**. Scan for personal information and make it generic — and
remember that anything ever committed lives in **history**, not just HEAD: a
finding is not fixed until the history that contains it is rewritten.

## What to look for

**Every rule in [CLAUDE.md](../../../CLAUDE.md) → Secrets / environment → What
must never be committed is a check.** Read them there; a category added there is
scanned for without this file changing.

Below is where those leaks hide, which the rules alone would not tell you:

- **A leak wearing the clothes of a project fact** — the author's own library
  sizes, folder layouts, hardware or workflow, stated as though describing the
  app. Reframe as a generic worked example ("say 40k images", "a 64GB machine")
  or delete.
- **A sentence about the local media set that reads as a sentence about the
  feature.** `goonpacks/<dir>/media/` is gitignored and exists on one machine,
  so anything about its contents is private: a persona note justified by "which
  is what her pictures are", a cost estimate that needs a real count. Both have
  slipped from the feature to the set. **Do not quote the offending sentence
  when reporting it** — restating it is the same leak.
- **Sourcing implied rather than stated** — a platform name in a
  downloading/collecting context, a scraper or downloader tool name. The app is
  source-agnostic (DEVELOPERS.md → Content policy).
- **Leaky meta-files** — a `.gitignore` entry or a script name can reveal what
  it hides; weigh the wording, not just the file it points at.
- **Commit messages** — a surface of their own: session links and attribution
  trailers (`Claude-Session:`, tool-generated URLs), personal emails or URLs in
  message bodies. `-S` only searches content — messages need
  `git log --all --grep='<pattern>'` — and a message finding has no working-tree
  fix: remediation is always a history rewrite (a message-only
  `filter-branch --msg-filter` keeps every tree identical).
- **PR titles, descriptions and comments** — public the moment they're posted,
  and not in git at all, so no `git` search will ever find them. Read the body
  you wrote (`gh pr view <n> --json title,body,comments`) with the same eye as a
  doc. **Where an edit takes personal information out**, editing is not removal:
  GitHub keeps a revision history behind the body's _edited_ marker, readable by
  anyone who can see the PR. Deleting a revision is UI-only and author-only, so
  that edit has to be followed by "open the edited dropdown and delete the
  revision" — say so rather than calling it fixed. An edit that only adds or
  reworks text leaves nothing in the old revision that wasn't already public, so
  it needs no follow-up and isn't worth mentioning.

## Scope

Default: the branch — **every revision of every file it changed**, plus
`git log main..HEAD` for messages and the PR's title/body/comments if one is
open. `/personal-check all`: the whole tree — every committed file, plus
filenames of untracked files (they may get committed later). Fan out one
read-only subagent per directory and collect their reports. Expensive; this is
not the per-PR mode.

### Every revision, not the final diff

`git diff main...HEAD` shows where the branch **landed**, not what it published.
Text added in one commit and removed in a later one never appears in it, and on
a branch that is pushed as it goes, every one of those commits was public the
moment it landed. A long branch with doc churn can rewrite the same paragraph
five times; the final diff reads one of them.

So the content pass is over the union of every added line in every commit.
Subtract the lines the final tree already holds, and what remains is exactly the
material no final-diff pass reads — where a deleted-but-published leak hides.

Two things make that remainder small enough to read rather than skim:

- **Reconstruct each revision whole; don't read the diff.** For each changed
  `*.md`, walk `git log main..HEAD --format=%h -- <file>`, `git show <c>:<file>`
  each one, and **strip fenced code blocks** before collecting. A plan or spec
  doc is mostly code, and a diff-based filter cannot tell a `+` prose line from
  a `+` line of a code sample — one branch's plan doc went from 3,278 apparently
  unread lines to 65 once fences were stripped.
- **Read comments and prose; pattern-scan the rest.** In code files, personal
  information reaches the reader through comments and string literals. Read
  every comment the branch ever added; run the identifier patterns (**What to
  look for**) over everything else.

Deduplicate before reading — a rename or pronoun pass repeats one sentence
across many revisions.

This is content only. Messages, PR text and history exposure are their own
passes.

### Do not let the findings so far shape the search

Once a finding exists, the cheap next move is to grep the rest of history for
its wording — which finds more of what is already known and nothing else. The
identifier patterns come from **What to look for** and run in full regardless.
For the categories no regex covers — a set's size, a folder layout, hardware,
sourcing — reading is the only pass that works, so the remainder above gets
read, not searched.

## History — the part that actually matters

For **every** finding, determine exposure before calling it fixed:

1. `git log --all -S'<the string>' --oneline` (and `-- <file>` for whole files):
   which commits contain it?
2. Pick the remediation the exposure requires:
   - **Never committed** → fix the working tree; done.
   - **Committed, not pushed** → fix, then rewrite so no commit ever contains it
     — fixup into the introducing commit, or squash the introducing and removing
     commits together. Editing HEAD alone leaves the data in history.
   - **Pushed** → rewrite and **force-push**, and say plainly: GitHub retains
     once-pushed objects server-side even after a force-push — truly purging
     them needs GitHub support, and anything that sat public may have been seen
     or archived.
3. **Verify**: the `git log --all -S` search returns nothing; then check the
   places rewrites miss — backup branches, remote-tracking refs, stashes, other
   clones. A backup branch that still reaches the old commit _is_ the leak.

Do the content fix and the history cleanup in the same piece of work — get
explicit approval for the rewrite/force-push, then finish it. Report what
remains exposed (retained server-side objects, other clones) rather than
claiming complete removal.

## Red flags

| Thought                              | Reality                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| "It's only in an old commit"         | History is one click away on a public repo.              |
| "It's just my hardware/folder names" | Identifying details compound across files.               |
| "I'll clean history later"           | Later is when someone else finds it. Same piece of work. |
| "Force-pushed, so it's gone"         | GitHub keeps once-pushed objects. Say so.                |
| "It's only the PR description"       | Public, unsearchable by git, and edits leave a revision. |
| "The pictures aren't committed"      | Describing them publishes them anyway.                   |
| "It's not in the final diff"         | A pushed branch published every commit on the way.       |
| "I grepped for it and it's clean"    | Grepping the findings finds the findings. Read.          |
