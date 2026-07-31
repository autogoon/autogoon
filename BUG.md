# BUG

Known defects in behaviour that is already implemented. Severity decides when
one gets fixed, not whether it belongs here. The divide against the other files
is in [CLAUDE.md → Documentation](./CLAUDE.md#documentation).

## Voice

- **"Listening" can be shown with no audio flowing.** `start()` resumes the
  AudioContext fire-and-forget (`void audioContext.resume()`) and then sets
  `listening` regardless of `audioContext.state`. A suspended context is never
  pulled, so the worklet never feeds the recognizer and no word is heard — the
  safe word included — while the header shows the green mic. Nothing retries and
  nothing reports it; only toggling Listen off and on recovers.

  Reaching it needs an engine that refuses to resume a context created without a
  user gesture, which the autostart-on-load path always is. Chromium and Firefox
  appear not to, and Playwright's WebKit cannot stand in for Safari, so whether
  Safari does is unverified.

  Two candidate fixes, and which is right depends on that answer. Awaiting the
  resume and failing the start unless the context is running tells the truth and
  leaves the refs clean for a retry, but would hang on load in an engine that
  keeps `resume()` pending until a gesture. Deriving `listening` from a
  `statechange` listener never hangs, but `toggleListening` calls `start()`
  whenever `listening` is false, so it would open a second stream and context
  over the suspended one.

## Companions

- **An exhausted media set reads as "nothing matches".** Once everything
  matching a request has been sent, the exclusion set covers it all and
  `searchMedia` returns nothing. The companion is told "Nothing in your pictures
  or videos matches that", which is false, and the prompt then has them ask him
  for something else.

  The exclusion is thread-scoped, not session-scoped. It is rebuilt from the
  thread, which persists per companion and is never trimmed, so it only grows.
  Clearing the thread is the one thing that resets it. Exhaustion is where any
  pack ends up, not an edge case for a small one.

  The retrieval work this waits on is
  [roadmap/INFERENCE-LIBRARY.md](./roadmap/INFERENCE-LIBRARY.md) → The search is
  thread-scoped.

  How often a companion should repeat a picture unprompted is the open question.
  **Sending is deliberately unfiltered**: `pickMedia` sends any ref it is given,
  already sent or not, because "send me my favourite picture of you" has to
  work.
