# The safe word — stopping the toy, and the companion knowing why

The safe word halts the Player and nothing else. `page.tsx` routes it straight
to `player.pause()`. The device stops; the companion's reply plays on, and their
next turn opens knowing only that the toy is no longer running.

It should stop the toy and cut them off. `cancelReply` already does the cutting
off, for a barge-in. Then they react in character: a companion cut off
mid-sentence and never told why is worse than one who answers for it. Tearing
the voice session down is the wrong shape.

Two constraints hold whatever mechanism carries it:

- The word has to be live whenever a companion could be speaking, not only while
  the Player plays. `page.tsx` puts it in the grammar on `playing`. With the
  device stopped there is no spoken way to cut them off at all.
- Their tools stay live throughout. Whatever tells them also has to stop them
  calling `start` straight after.

To settle:

- **How they are told.** A marked message the app writes onto the thread, the
  way an ambient turn is cued, or a user turn.
- **The two concurrent mic captures.** vosk and ElevenLabs STT both receive the
  word, so it must not also arrive as an ordinary transcribed turn.
