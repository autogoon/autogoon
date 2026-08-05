# BUG

Known defects in behaviour that is already implemented. Severity decides when
one gets fixed, not whether it belongs here. What belongs here rather than in
the other files is in [CLAUDE.md → Documentation](./CLAUDE.md#documentation).

## Voice

- **The header can show "Listening" with no audio flowing.** `start()` resumes
  the AudioContext fire-and-forget (`void audioContext.resume()`) and then sets
  `listening` regardless of `audioContext.state`. A suspended context does not
  render, so the worklet never feeds the recognizer. No word is heard — the safe
  word included — while the header shows the green mic. Nothing retries and
  nothing reports it; only toggling Listen off and on recovers.

  Reaching it needs an engine that refuses to resume a context created without a
  user gesture. The autostart-on-load path always creates the context that way.
  Chromium and Firefox appear not to refuse. Playwright's WebKit cannot stand in
  for Safari, so whether Safari does is unverified.

  Which of the two fixes is right depends on that answer. Awaiting the resume
  and failing the start unless the context is running keeps `listening` accurate
  and leaves the refs clean for a retry, but would hang on load in an engine
  that keeps `resume()` pending until a gesture. Deriving `listening` from a
  `statechange` listener never hangs, but `toggleListening` calls `start()`
  whenever `listening` is false, so it would open a second stream and context
  over the suspended one.

## Companions

- **An exhausted media set reads as "nothing matches".** Once everything
  matching a request has been sent, the exclusion set covers it all and
  `searchMedia` returns nothing. The companion is told "Nothing in your pictures
  or videos matches that". That is false, and the prompt then has them ask the
  player for something else.

  The exclusion is thread-scoped, not session-scoped. It is rebuilt from the
  thread. The thread persists per companion and is never trimmed, so the
  exclusion set only grows. Clearing the thread is the one thing that resets it.
  Every pack is exhausted eventually, not only a small one.

  The fix is the retrieval work in
  [roadmap/INFERENCE-LIBRARY.md](./roadmap/INFERENCE-LIBRARY.md) → The search is
  thread-scoped.

  How often a companion should repeat a picture unprompted is the open question.
  **Sending is deliberately unfiltered**: `pickMedia` sends any ref it is given,
  already sent or not, because "send me my favourite picture of you" has to
  work.

## Bug braindump

Noticed in use, unsorted and unverified. An entry earns a section of its own
once someone has read the code under it.

- The UI for Companions is poor.

  - Reset is only on the program preview, so you have to turn that on from the
    menu to reset.
  - Start and Stop for the program are only on the Controls tab — the Session
    tab's Stop cancels the reply — so working the toy by hand means leaving the
    chat.
  - Other entries in this braindump are Companions UI too.
  - Connect is only in the app header, which the play screen hides.

- Companions report that the settings for the toy haven't changed after they
  issue an intensity or variety change.

- You can't send a message by text (as opposed to STT) while the companion is
  speaking. Text should interrupt the reply the way speech does.

- You should be able to see the toy's status (intensity/variety) while the
  lightbox is open.

- With the lightbox open, an indicator that changes (10% → 20%) should be
  highlighted in a chip — temporarily?

- Whether a reply is spoken is chosen per message — Send gives a silent reply,
  Say it a spoken one — with no setting making one of them the default.

- If you sent the message using text, media the companion sends on their turn
  shouldn't auto-open.

- The Inference tab should be gated on a setting in Settings, even in dev mode.

- Removing a pack from the Goonpacks list doesn't show that the pack has been
  removed, even when it has. Needs re-testing since disk packs landed.

- With variety off in Companions, there was still some variety. Likely the same
  in Goon and Groove. All three need checking.
