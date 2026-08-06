# Improve keyword detection

Sound from another device in the room — a TV playing with the sound up —
commonly runs a command. The browser's own echo cancellation already handles
audio the app itself is playing, though the keyword spotter takes the browser
default rather than requesting it (`src/components/keyword-spotter.tsx`).

Does vosk expose a setting that requires a minimum input level, or a minimum
confidence, before a word counts as heard? Is there a keyword spotter that can
be trained on one voice, so the recognizer picks the user out and ignores
everyone else in the room?

A level gate sits in the worklet that feeds the recognizer
(`public/kws-audio-worklet.js`); only a confidence gate would come from vosk.
