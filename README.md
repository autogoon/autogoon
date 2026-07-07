# Keyword Spotting + Vacuglide control

A Next.js app (App Router, TypeScript, Tailwind v4). A single page with a sticky
header bar — a mic **Listen** toggle (keyword spotting), device **Connect**, live
device status, and a **Stop** button while an algorithm runs — and four tabs:
three device algorithms plus settings.

1. **Gooning** (the default tab) — an automatic 30-minute slow build: it drives
   the same dip machinery as Homegrown, but ramps Speed up and Variability down
   over a timeline, with intensity, two-phase teasing, timeline scrubbing
   (forward/back/finish) and time dilation (faster/slower). See
   [GOONING-AUTOPILOT.md](./GOONING-AUTOPILOT.md).
2. **Homegrown** — a hand-built algorithm: a repeating dip pattern shaped by two
   controls, Speed and Variability. See [HOMEGROWN-AUTOPILOT.md](./HOMEGROWN-AUTOPILOT.md).
3. **Vacuglide** — a recreation of `fun.autoblow.com/vacuglide/autopilot`, talking
   directly to the
   [Vacuglide HTTP API](https://developers.autoblow.com/reference/http-api-v1-vacuglide/).
   See [VACUGLIDE-AUTOPILOT.md](./VACUGLIDE-AUTOPILOT.md).
4. **Settings** — device token entry and appearance (theme) controls.

Keyword spotting — in-browser speech detection via
[vosk-browser](https://github.com/ccoreilly/vosk-browser) (WASM Kaldi) — runs from
the header **Listen** toggle and drives the device hands-free. The recognizer's
grammar is exactly the words the running algorithm publishes plus the global
`connect`/`start`/`stop` (e.g. `faster`/`slower`, `more`/`less`, `forward`/`back`,
`finish`, `cumming`, `up`/`down`); a detected word is dispatched by the algorithm
runner to the active algorithm's action. Detections fire from streaming _partial_
results for low latency.

## Running

```sh
npm install
npm run dev      # Next dev server on http://localhost:8931 (bound to 0.0.0.0)
```

Also: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run format`.

Everything is local/offline except the Autoblow cloud API. The ~40MB recognizer
model (`public/vosk-model-small-en-us-0.15.tar.gz`) is fetched by the page on load
and cached by the browser.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the app is put together: the
  engine/hook/panel split, the shared device layer, the algorithm runner, the
  keyword spotter, and the Vacuglide HTTP API.
- [GOONING-AUTOPILOT.md](./GOONING-AUTOPILOT.md) — the automatic slow-build algorithm.
- [HOMEGROWN-AUTOPILOT.md](./HOMEGROWN-AUTOPILOT.md) — the hand-built dip algorithm.
- [VACUGLIDE-AUTOPILOT.md](./VACUGLIDE-AUTOPILOT.md) — the reverse-engineered
  autopilot algorithm (mystery script, intensity, edge control, suction).
