# Autogoon — voice-controlled gooning

Autogoon drives an Autoblow
[Vacuglide or Vacuglide 2](https://developers.autoblow.com/reference/http-api-v1-vacuglide/)
stroker from your browser, **entirely by voice**. Run a whole session hands-free —
just speak (`start`, `faster`, `slower`, `more`, `less`, `finish`, `cumming`) and
it works the device for you. Pick a movement "algorithm" to ride — including an
automatic 30-minute slow build — and never touch the screen.

## What it does

- **Hands-free voice control.** In-browser speech recognition listens for short
  spoken commands — `start`/`stop`, `faster`/`slower`, `more`/`less`,
  `forward`/`back`, `finish`, `cumming`, `up`/`down` — and drives whichever
  algorithm is running, so the whole session is hands-free. No app, no wearable,
  no clicking around: just talk.
- **Gooning — an automatic slow build.** A 30-minute program that starts slow and
  teasing and ramps up to a controlled finish. An **intensity** dial sets how far
  it builds (turn it down when you're more sensitive), and **time dilation**
  (faster/slower) stretches or compresses the journey on the fly. It teases
  automatically along the way and holds at the top until you finish.
- **Homegrown — a manual pattern.** A repeating stroke pattern you shape live with
  two controls: **Speed** and **Variability**.
- **Vacuglide — the official autopilot.** A faithful recreation of Autoblow's own
  vacuglide autopilot.

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

1. **Gooning** (the default tab) — see [GOONING-AUTOPILOT.md](./GOONING-AUTOPILOT.md).
2. **Homegrown** — see [HOMEGROWN-AUTOPILOT.md](./HOMEGROWN-AUTOPILOT.md).
3. **Vacuglide** — talks directly to the
   [Vacuglide HTTP API](https://developers.autoblow.com/reference/http-api-v1-vacuglide/);
   see [VACUGLIDE-AUTOPILOT.md](./VACUGLIDE-AUTOPILOT.md).
4. **Settings** — device token entry and appearance (theme).

Keyword spotting uses [vosk-browser](https://github.com/ccoreilly/vosk-browser)
(WASM Kaldi). The recognizer's grammar is exactly the running algorithm's
published commands plus the global `connect`/`start`/`stop`, and detections fire
from streaming _partial_ results for low latency.

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
  engine/hook/panel split, the shared device layer, the algorithm runner, the
  keyword spotter, and the Vacuglide HTTP API.
- [GOONING-AUTOPILOT.md](./GOONING-AUTOPILOT.md) — the automatic slow-build algorithm.
- [HOMEGROWN-AUTOPILOT.md](./HOMEGROWN-AUTOPILOT.md) — the hand-built dip algorithm.
- [VACUGLIDE-AUTOPILOT.md](./VACUGLIDE-AUTOPILOT.md) — the reverse-engineered
  autopilot algorithm (mystery script, intensity, edge control, suction).
