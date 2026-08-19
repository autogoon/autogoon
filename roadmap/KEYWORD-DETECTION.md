# Improve keyword detection

Sound from another device in the room — a TV playing with the sound up —
commonly runs a command. The browser's own echo cancellation already handles
audio the app itself is playing, though the keyword spotter takes the browser
default rather than requesting it (`src/components/keyword-spotter.tsx`).

Investigate whether vosk exposes a setting requiring a minimum input level or a
minimum confidence before a word counts as heard. Investigate keyword spotters
that can be trained on a single voice to ignore other speakers in the room.

A level gate sits in the worklet that feeds the recognizer
(`public/kws-audio-worklet.js`); only a confidence gate would come from vosk.
