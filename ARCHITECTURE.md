# Architecture

A single-page app with a sticky header bar and four tabs (Goon, Homegrown,
Autopilot, Settings). `src/app/page.tsx` owns the layout and mounts every
controller hook at the top of the tree, so the keyword spotter and all the
algorithms keep running regardless of which tab is visible — hidden tabs stay
mounted, only their visibility changes.

## The program / player model

The core of the app is a split between **generating** a program and **playing**
it. Everything device-facing goes through this.

**A program is a single array of timed events** over "program-time" (ms), with
one cursor marking where the clock is now (`src/lib/program.ts`). There are two
event kinds:

- a **speed event** `{ at, speed }` — a target-speed change. `speed` is raw; the
  algorithm transforms it at send time (see `scale` below).
- a **valve event** `{ at, valve, open }` — open or close a stroke valve. A pulse
  is therefore **two events**, an open and a later close, so a fixed pulse and a
  variable-length hold share one representation.

There is no separate "history": events before the cursor are the past, events
after it are the future, in the same array.

**The Player** (`src/lib/player.ts`) plays a program and is the only thing that
touches the device's motion commands. It owns the program-clock, the playback
**rate** (time dilation), the ~100 ms tick loop, sending target speeds (with
duplicate-send suppression), executing valve events, keeping ~2 minutes of future
built ahead, transport (`play`/`pause`, `forward`/`back` = ±1 min, `faster`/
`slower`, `seekTo`), the `pagehide` safety-stop, and the upcoming-speed window the
sparkline draws. It knows nothing about any specific algorithm. There is **one**
Player, owned by the device hook; it plays whichever algorithm is active.

**An AlgorithmEngine** (`src/lib/*-engine.ts`) is what each algorithm *is* here: a
generation-only object with three methods —

- `generate(fromTime, untilTime, ctx)` — the Player *pulls* this to extend the
  timeline (in whole cycles), keeping ~2 minutes ahead, so looping algorithms
  never materialise all at once. Automatic valve pulses (tease, vacuum
  maintenance, the cumming pulse) are emitted here as open/close event pairs, so
  they regenerate with the curve and show on the sparkline.
- `scale(event, ctx)` — maps a raw speed event to the device value at *send* time.
  It's called every tick, so a "magnitude" knob stays live with no regeneration.
- `reset()` — start a fresh session.

The Player calls back into the engine; the engine never touches the device or a
clock of its own.

**How a change reaches the device** — two directions:

- *Magnitude* knobs (Goon's intensity, Homegrown's Speed %) live in `scale()`; the
  next tick picks them up.
- *Shape* changes (Homegrown's Variability, Autopilot's intensity/edge) and
  program rewrites (`cumming`, Autopilot's finish) update engine state and then the
  Player `invalidateFuture()`s — it drops the events after the cursor and re-pulls
  `generate`, which reflects the new state. Regeneration only ever rewrites the
  future, never the past.

**Position = the clock.** Goon's 30-minute build is a *position*, and that
position **is** the Player's clock; time dilation is the Player's rate. So
`forward`/`back`/`finish`/`faster`/`slower` are just the Player moving or
consuming the clock, and the engine samples its curves at each event's
program-time — a jump needs no special handling.

**Manual valve control** rides the live program: `vacuglide.valvePlus` /
`valveMinus` insert an open (on press) and a close (on release) event via
`Player.insertEvent` while something is playing, and drive the device directly
when nothing is.

## Three layers per algorithm

Each device-driving algorithm is split into three layers:

- an **engine** — a plain-TS `AlgorithmEngine` that only *generates* events and
  *scales* them (`src/lib/autopilot-engine.ts`, `homegrown-engine.ts`,
  `goon-engine.ts`). Engines are self-contained and never import from one another;
  where two algorithms share a shape (Goon reuses Homegrown's dip), the helpers are
  **duplicated**, not shared — a deliberate boundary so each algorithm stays
  standalone.
- a **hook** — a React wrapper (`src/hooks/use-*.ts`) that mirrors the shared
  Player into render state while this engine is the active source, owns the UI
  default knob values (constructed into the engine), and wires the knob handlers
  (magnitude → set state; shape/command → set state + `invalidateFuture`), the
  transport buttons (to the Player), and the voice keywords.
- a **panel** — presentation only (`src/components/*-panel.tsx`).

Adding an algorithm is a new engine/hook/panel plus one entry in the
`algorithms[]` array in `page.tsx` and one tab — nothing else wires up.

## Shared device and the algorithm runner

Every algorithm shares one device **and** one Player via `useVacuglideDevice`
(`src/hooks/use-vacuglide-device.ts`), which wraps the `src/lib/vacuglide-device.ts`
API client and owns the single `Player`. An engine reaches the device only
indirectly, through the Player.

`useAlgorithmRunner` (`src/hooks/use-algorithm-runner.ts`) coordinates the
algorithms. It **derives** the currently-running algorithm from the engines' own
`isPlaying` (rather than keeping a separate copy that could drift when an algorithm
stops itself), enforces mutual exclusion — starting one stops any other — and
routes each detected keyword: `connect`/`start`/`stop` and the switch words it
handles itself, everything else it dispatches to the running algorithm.

While an algorithm is running, switching is locked: the page disables the other
algorithm tabs (the running one's tab and Settings stay reachable), and the runner
drops the per-algorithm switch words from the grammar — only the running
algorithm's own commands and `stop` respond.

## Controls

The header bar holds the shared controls — the Listen toggle (keyword spotting),
the device Connect button, live device status (speed + valve pills), and a Stop
button whenever an algorithm is running. Each algorithm panel has its own Start
button (a `RunButton`), so Connect stays global while Start is per-algorithm.

Shared UI is factored into components (`src/components/`): `Card`, `LogCard`,
`RunButton`, `HoldButton` (the press-and-hold Stroke buttons, minimum 300 ms open
so a tap still pulses), `Slider`, `Segmented`, and `Sparkline` — a glanceable
step-line of the upcoming speed (fed by the Player's upcoming-window), coloured by
speed and redrawn each tick.

## Device API

`src/lib/vacuglide-device.ts` talks directly to the
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
published words plus the global words (`connect`/`start`/`stop`, and while stopped
a switch word per algorithm) — rebuilt whenever that word set changes. Detections
fire from vosk's settled per-utterance result (the `result` event; streaming
partials are ignored). The ~40 MB recognizer model
(`public/vosk-model-small-en-us-0.15.tar.gz`) is fetched on load and cached by the
browser. It lives in `useKeywordSpotter` (`src/hooks/use-keyword-spotter.ts`) and,
like the algorithms, is mounted at the top of the tree so it keeps listening across
tab switches. Each detected word is handed to the algorithm runner
(`useAlgorithmRunner`), which routes `connect`/`start`/`stop` and the switch words
itself and dispatches any other word to the running algorithm's matching action.

Each algorithm carries a `switchWord` — the spoken word that selects it while
idle, kept separate from `label` because a label could be display text that isn't
a single in-vocabulary word (e.g. "Gooning" or "Vacuglide" wouldn't be
recognized). Today every switch word is just the lowercased label (`goon`,
`autopilot`, `homegrown`), but the split lets a future algorithm name something
unspeakable while still exposing a recognizable switch word. Selecting an algorithm
points voice `start` at it and brings its tab into view.
