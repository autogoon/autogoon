---
name: personal-check
description:
  Use before pushing to the public repo, before a PR is marked ready, or after
  writing docs/content — scans for personal information, identifying details, or
  content-sourcing references that shouldn't be public, and checks whether any
  finding is already baked into git history.
---

# Personal check

This repo is **public**. Scan for personal information and make it generic — and
remember that anything ever committed lives in **history**, not just HEAD: a
finding is not fixed until the history that contains it is rewritten.

## What to look for

- **Personal use-case framing stated as project fact** — the author's own
  library sizes, folder layouts, hardware, workflows. Reframe as a generic
  worked example ("say 40k images", "a 64GB machine") or delete.
- **Identifying details** — names, emails, locations, accounts, personal URLs,
  device/setup details that pin down one person.
- **Content-sourcing references** — platform names in a downloading/collecting
  context, scraper or downloader tool names, anything implying where content
  comes from. The app is source-agnostic (see DEVELOPERS.md → Content policy);
  docs must be too.
- **Personal legal/risk discussion** — analysis of the author's own liability
  belongs outside the repo entirely, kept locally and gitignored.
- **Secrets** — keys and tokens (should already be impossible via `.env`
  hygiene, but look anyway).
- **Leaky meta-files** — a `.gitignore` entry or script name can itself reveal
  what it hides; weigh the entry's wording.

## Scope

Default: the branch (`git diff main...HEAD`). `/personal-check all`: the whole
tree — every committed file, plus filenames of untracked files (they may get
committed later).

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
