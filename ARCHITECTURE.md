# Architecture

A single-page app with a sticky header bar and four tabs (Goon, Homegrown,
Autopilot, Settings). `src/app/page.tsx` owns the layout and mounts
every controller hook at the top of the tree, so the KWS recognizer and the
algorithms keep running regardless of which tab is visible — hidden tabs stay
mounted, only their visibility changes.

## Three layers per feature

Each device-driving feature is split into three layers:

- an **engine** — a plain-TS class that owns the device commands and a
  subscribe/notify loop (`src/lib/autopilot-engine.ts`,
  `src/lib/homegrown-engine.ts`, `src/lib/goon-engine.ts`);
- a **hook** — a React wrapper that mirrors the engine into render state and
  owns the UI defaults (`src/hooks/use-autopilot.ts`, `use-homegrown.ts`, `use-goon.ts`); and
- a **panel** — presentation only (`src/components/autopilot-panel.tsx`,
  `homegrown-panel.tsx`, `goon-panel.tsx`).

The engine knows nothing about the UI's default settings; the hook is the
source of truth for those and passes them in when it constructs the engine.

## Shared device and the algorithm runner

Both algorithms share a single device via `useVacuglideDevice`
(`src/hooks/use-vacuglide-device.ts`), which wraps the `src/lib/vacuglide.ts` API
client. Each engine reaches it through a `getDevice()` accessor rather than
holding its own connection.

`useAlgorithmRunner` (`src/hooks/use-algorithm-runner.ts`) coordinates the
algorithms. It **derives** the currently-running algorithm from the engines'
own `isPlaying` state (rather than keeping a separate copy that could drift when
an engine stops itself), and enforces mutual exclusion — starting one algorithm
stops any other. Adding a new algorithm means adding a hook in `page.tsx` and
one more entry in the array handed to the runner.

While an algorithm is running, switching is locked: the page disables the other
algorithm tabs (the running one's tab and Settings stay reachable), and the runner
drops the per-algorithm switch words from the grammar — only the running
algorithm's own commands and `stop` respond.

## Controls

The header bar holds the shared controls — the Listen toggle (KWS), the device
Connect button, live device status (speed + valve pills), and a Stop button
whenever an algorithm is running. Each algorithm panel has its own Start button
(a `RunButton`), so Connect stays global while Start is per-algorithm.

Shared UI is factored into components: `Card`, `LogCard`, `RunButton` and
`HoldButton` (`src/components/`).

## Device API

`src/lib/vacuglide.ts` talks directly to the
[Vacuglide HTTP API](https://developers.autoblow.com/reference/http-api-v1-vacuglide/).
All requests carry an `x-device-token` header. Connection flow:

1. `GET https://latency.autoblowapi.com/vacuglide/connected` →
   `{connected, cluster}` — finds which regional cluster the device is on.
2. `GET https://{cluster}/vacuglide/info` — firmware/hardware info; confirms
   `deviceType === "vacuglide"`.
3. Control endpoints on that cluster:
   - `PUT /vacuglide/target-speed` `{targetSpeed: 0..100}`
   - `PUT /vacuglide/target-speed/stop`
   - `PUT /vacuglide/valve/stroke-plus` `{valveState: bool}`
   - `PUT /vacuglide/valve/stroke-minus` `{valveState: bool}`
   - `GET /vacuglide/state`

The API is rate limited (`x-ratelimit-*` response headers). The device token is
remembered in `localStorage`.

## Keyword spotting

In-browser speech keyword detection using
[vosk-browser](https://github.com/ccoreilly/vosk-browser) (WASM Kaldi) with a
grammar constrained to the words valid right now — the running algorithm's
published words plus the global words (`connect`/`start`/`stop`, and while stopped a
switch word per algorithm) — rebuilt whenever that word set changes. Detections fire
from vosk's settled per-utterance result (the `result` event; streaming partials are
ignored). The ~40MB recognizer model
(`public/vosk-model-small-en-us-0.15.tar.gz`) is fetched on load and cached by
the browser. It lives in `useKeywordSpotter` / `keyword-spotter.tsx` and, like
the algorithms, is mounted at the top of the tree so it keeps listening across
tab switches. Each detected word is handed to the algorithm runner
(`useAlgorithmRunner`), which routes `connect`/`start`/`stop` and the algorithm
switch words itself, and dispatches any other word to the running algorithm's
matching action.

Each algorithm carries a `switchWord` — the spoken word that selects it while
idle, kept separate from `label` because a label could be display text that isn't
a single in-vocabulary word (e.g. "Gooning" or "Vacuglide" wouldn't be recognized).
Today every switch word is just the lowercased label (`goon`, `autopilot`,
`homegrown`), but the split lets a future algorithm name something unspeakable
while still exposing a recognizable switch word.
Selecting an algorithm points voice `start` at it and brings its tab into view.
Switching is disabled while an algorithm runs: the switch words leave the grammar,
and `page.tsx` disables the other algorithm tabs (the running one's own tab and
Settings stay reachable).
