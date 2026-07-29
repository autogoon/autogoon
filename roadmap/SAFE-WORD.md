# The safe word — stopping the toy, and the companion knowing why

The safe word halts the Player and nothing else: `page.tsx` routes it straight
to `player.pause()`, so the device stops while the companion's reply plays on
and their next turn opens as though nothing happened.

What it should do is stop the toy, cut them off — `cancelReply` already does
that for a barge-in — and then let them react in character. Tearing the voice
session down is the wrong shape: a companion cut off mid-sentence and never told
why is worse than one who answers for it, so the reaction is the point rather
than the silence.

Two things hold whatever mechanism carries it:

- The word has to be live whenever a companion could be speaking, not only while
  the Player plays. `page.tsx` puts it in the grammar on `playing`, so with the
  device stopped there is no spoken way to cut them off at all.
- Their tools stay live throughout, so whatever tells them also has to stop them
  calling `start` straight after.

To settle:

- **How they are told.** A marked message the app writes onto the thread, the
  way an ambient turn is cued, or a user turn.
- **The two concurrent mic captures.** vosk and ElevenLabs STT both hear the
  word, so it must not also arrive as an ordinary transcribed turn.
