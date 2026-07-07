# Autogoon

Autogoon is a browser-based controller for the
[Autoblow Vacuglide](https://developers.autoblow.com/reference/http-api-v1-vacuglide/)
stroker. It drives the device with a choice of movement "algorithms" and lets you
run the whole session **hands-free by voice**.

## What it does

- **Gooning — an automatic slow build.** A 30-minute program that starts slow and
  teasing and ramps up to a controlled finish. An **intensity** dial sets how far
  it builds (turn it down when you're more sensitive), and **time dilation**
  (faster/slower) stretches or compresses the journey on the fly. It teases
  automatically along the way and holds at the top until you finish.
- **Homegrown — a manual pattern.** A repeating stroke pattern you shape live with
  two controls: **Speed** and **Variability**.
- **Vacuglide — the official autopilot.** A faithful recreation of Autoblow's own
  vacuglide autopilot.
- **Hands-free voice control.** In-browser speech recognition listens for short
  spoken commands — `start`/`stop`, `faster`/`slower`, `more`/`less`,
  `forward`/`back`, `finish`, `cumming`, `up`/`down` — and drives whichever
  algorithm is running, so you never have to touch the screen.

Everything runs in your browser; the only thing that leaves your machine is the
control traffic to Autoblow's cloud API for the device itself.

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

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the app is put together: the
  engine/hook/panel split, the shared device layer, the algorithm runner, the
  keyword spotter, and the Vacuglide HTTP API.
- [GOONING-AUTOPILOT.md](./GOONING-AUTOPILOT.md) — the automatic slow-build algorithm.
- [HOMEGROWN-AUTOPILOT.md](./HOMEGROWN-AUTOPILOT.md) — the hand-built dip algorithm.
- [VACUGLIDE-AUTOPILOT.md](./VACUGLIDE-AUTOPILOT.md) — the reverse-engineered
  autopilot algorithm (mystery script, intensity, edge control, suction).
