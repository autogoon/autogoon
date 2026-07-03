# Architecture

A single-page app with a sticky header bar and four tabs (Keyword Spotting,
Autopilot, Homegrown, Settings). `src/app/page.tsx` owns the layout and mounts
every controller hook at the top of the tree, so the KWS recognizer and the
algorithms keep running regardless of which tab is visible — hidden tabs stay
mounted, only their visibility changes.

## Three layers per feature

Each device-driving feature is split into three layers:

- an **engine** — a plain-TS class that owns the device commands and a
  subscribe/notify loop (`src/lib/autopilot-engine.ts`,
  `src/lib/homegrown-engine.ts`);
- a **hook** — a React wrapper that mirrors the engine into render state and
  owns the UI defaults (`src/hooks/use-autopilot.ts`, `use-homegrown.ts`); and
- a **panel** — presentation only (`src/components/autopilot-panel.tsx`,
  `homegrown-panel.tsx`).

The engine knows nothing about the UI's default settings; the hook is the
source of truth for those and passes them in when it constructs the engine.

## Shared device and the algorithm runner

Both algorithms share a single device via `useVacuglide`
(`src/hooks/use-vacuglide.ts`), which wraps the `src/lib/vacuglide.ts` API
client. Each engine reaches it through a `getDevice()` accessor rather than
holding its own connection.

`useAlgorithmRunner` (`src/hooks/use-algorithm-runner.ts`) coordinates the
algorithms. It **derives** the currently-running algorithm from the engines'
own `isPlaying` state (rather than keeping a separate copy that could drift when
an engine stops itself), and enforces mutual exclusion — starting one algorithm
stops any other. Adding a new algorithm means adding a hook in `page.tsx` and
one more entry in the array handed to the runner.

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
grammar constrained to a small, page-editable word list. Detections fire from
streaming _partial_ results for low latency. The ~40MB recognizer model
(`public/vosk-model-small-en-us-0.15.tar.gz`) is fetched on load and cached by
the browser. It lives in `useKeywordSpotter` / `keyword-spotter.tsx` and, like
the algorithms, is mounted at the top of the tree so it keeps listening across
tab switches. It is not yet wired to drive the device.
