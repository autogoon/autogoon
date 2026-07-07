# Autogoon — voice-controlled gooning

Autogoon drives an Autoblow
[Vacuglide or Vacuglide 2](https://developers.autoblow.com/reference/http-api-v1-vacuglide/)
stroker from your browser, **entirely by voice**. Run a whole session hands-free —
`connect`, `start`, and `stop` work anywhere, you switch algorithm by saying its
name, and each algorithm adds its own spoken commands (`faster`, `slower`, `finish`,
and so on). Pick a movement "algorithm" to ride — including an automatic 30-minute
slow build — and let voice do the rest.

## What it does

- **Hands-free voice control.** In-browser speech recognition listens for short
  spoken commands and drives whichever algorithm is running. `connect`, `start`,
  and `stop` work anywhere, and while stopped you switch algorithm by saying its
  switch word (`goon`, `homegrown`, `autopilot`); each algorithm also adds its own
  commands (`faster`/`slower`, `more`/`less`, `finish`, `cumming`, and so on),
  listed on its tab. Once a session is running the algorithm is locked in — only
  its own commands and `stop` respond, so you can't switch mid-session. Tap
  **Listen** once and it's voice the rest of the way: no app, no wearable.
- **Goon — an automatic slow build.** A 30-minute program that starts slow and
  teasing and ramps up to a controlled finish. An **intensity** dial sets how far
  it builds (turn it down when you're more sensitive), and **time dilation**
  (faster/slower) stretches or compresses the journey on the fly. It teases
  automatically along the way and holds at the top until you finish.
- **Homegrown — a manual pattern.** A repeating stroke pattern you shape live with
  two controls: **Speed** and **Variability**.
- **Autopilot — the official one.** A faithful recreation of Autoblow's own
  Vacuglide autopilot.

## Privacy

Everything runs in your browser; the only thing that leaves your machine is the
control traffic to Autoblow's cloud API for the device itself. Speech recognition
runs entirely locally (WASM in the page), so your microphone audio never leaves
your machine.

## The app

A Next.js app (App Router, TypeScript, Tailwind v4): a single page with a sticky
header bar — a mic **Listen** toggle (keyword spotting), device **Connect**, live
status, and a **Stop** button while an algorithm runs — and four tabs, one per
algorithm plus settings:

1. **Goon** (the default tab) — see [ALGORITHM-GOON.md](./ALGORITHM-GOON.md).
2. **Homegrown** — see [ALGORITHM-HOMEGROWN.md](./ALGORITHM-HOMEGROWN.md).
3. **Autopilot** — a faithful recreation of Autoblow's own autopilot, driving the
   [Vacuglide HTTP API](https://developers.autoblow.com/reference/http-api-v1-vacuglide/);
   see [ALGORITHM-AUTOPILOT.md](./ALGORITHM-AUTOPILOT.md).
4. **Settings** — an intro to the app, device token entry, and appearance (theme).

While an algorithm is running the other algorithm tabs are disabled (and their
voice switch words leave the grammar) — you can't switch algorithms mid-session,
by tab or by voice; stop first. The running algorithm's own tab and Settings stay
reachable.

Keyword spotting uses [vosk-browser](https://github.com/ccoreilly/vosk-browser)
(WASM Kaldi). The recognizer's grammar is exactly the running algorithm's
published commands plus the global words valid right now (`connect`/`start`/`stop`,
and while stopped a switch word per algorithm), and detections fire from vosk's
settled per-utterance result (the `result` event; streaming partials are ignored).

## Running

```sh
npm install
npm run dev      # Next dev server on http://localhost:8931 (bound to 0.0.0.0)
```

Also: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run format`.

The ~40MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is
fetched by the page on load and cached by the browser; nothing else is needed
offline.

## Running hands-free (mobile caveats)

The controlling tab has to stay **foregrounded and awake** — it runs the timing
loop and the microphone continuously, and mobile browsers suspend or heavily
throttle background or screen-locked tabs, which stops both.

- **iOS Safari** — strict: the moment the tab is backgrounded or the screen locks,
  the algorithm and the mic stop. In practice you need a **second device**
  dedicated to Autogoon (screen on, tab in front) while you use the toy. This is
  the only tested configuration.
- **iOS Chrome / Firefox / any iOS browser** *(untested)* — expected to behave
  exactly like iOS Safari: Apple requires every iOS browser to use the system
  WebKit engine, so they inherit the same background-tab and media limits.
- **Android Chrome** *(untested)* — likely more forgiving in the foreground with
  the screen on (different engine), but background/locked tabs are still throttled.
  A single device *may* work if you keep the tab in front and the screen awake
  (e.g. Screen Wake Lock) — unverified.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the app is put together: the
  program/player model, the engine/hook/panel split, the shared device layer and
  algorithm runner, the keyword spotter, and the Vacuglide HTTP API.
- [ALGORITHM-GOON.md](./ALGORITHM-GOON.md) — the automatic slow-build algorithm.
- [ALGORITHM-HOMEGROWN.md](./ALGORITHM-HOMEGROWN.md) — the hand-built dip algorithm.
- [ALGORITHM-AUTOPILOT.md](./ALGORITHM-AUTOPILOT.md) — the reverse-engineered
  autopilot algorithm (mystery script, intensity, edge control, suction).
