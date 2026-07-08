# Architecture

A single-page app with a sticky header bar and four tabs (Goon, Groove,
Autopilot, Settings). `src/app/page.tsx` owns the layout: it wraps everything in
the keyword-spotter provider, mirrors the one shared Player into React once, and
renders all four panels. Hidden tabs stay mounted (only their visibility
changes), so the recognizer and the running algorithm keep going regardless of
which tab is visible.

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

The Player carries a `state` — `armed` / `playing` / `paused`. The visible
algorithm tab **arms** the Player (`arm`), building a live preview before Start;
Start (`play`) then **resumes** from the held position rather than restarting,
Stop (`pause`) holds position, and `reset` restores the algorithm's default knobs
and regenerates from the beginning.

**An AlgorithmEngine** (`src/lib/algorithms/*-engine.ts`) is what each algorithm _is_ here: a
generation-only object with four methods —

- `generateSpeed(fromTime, untilTime, ctx)` — the Player _pulls_ this to extend the
  speed backbone (in whole cycles), keeping ~5 minutes ahead, so looping algorithms
  never materialise all at once.
- `generateValves(speedEvents, fromTime, untilTime, ctx)` — overlays the automatic
  valve pulses (tease, vacuum maintenance, the cumming pulse) across a span of
  already-built speed, as open/close event pairs that show on the sparkline. It's
  split from speed because a pulse's shape can depend on the speed in effect at
  that moment (Autopilot's suction), and because keeping it a _pure_ overlay lets
  the Player re-lay it over an unchanged speed script. It must not keep cadence
  state.
- `scale(event, ctx)` — maps a raw speed event to the device value at _send_ time.
  It's called every tick, so a "magnitude" knob stays live with no regeneration.
- `reset()` — start a fresh session.

The Player calls back into the engine; the engine never touches the device or a
clock of its own.

**How a change reaches the device** — two directions:

- _Magnitude_ knobs (Goon's intensity, Groove's Speed %) live in `scale()`; the
  next tick picks them up.
- _Shape_ changes (Groove's Variability, Autopilot's intensity/edge) and
  program rewrites (`cumming`, Autopilot's finish) update engine state and then the
  Player `invalidateFuture()`s — it drops the events after the cursor and re-pulls
  both channels, which reflect the new state. _Valve-only_ changes (Autopilot's
  vacuum maintenance) instead call `invalidateValves()`, which keeps the speed
  script byte-identical and only re-lays the valve overlay. Regeneration only ever
  rewrites the future, never the past.

**Position = the clock.** Goon's 30-minute build is a _position_, and that
position **is** the Player's clock; time dilation is the Player's rate. So
`forward`/`back`/`finish`/`faster`/`slower` are just the Player moving or
consuming the clock, and the engine samples its curves at each event's
program-time — a jump needs no special handling.

**Manual valve control** rides the live program: `vacuglide.valvePlus` /
`valveMinus` insert an open (on press) and a close (on release) event via
`Player.insertEvent` while something is playing, and drive the device directly
when nothing is.

## Two layers per algorithm

Each device-driving algorithm is two files:

- an **engine** — a plain-TS `AlgorithmEngine` that only _generates_ events and
  _scales_ them (`src/lib/algorithms/goon-engine.ts`, `groove-engine.ts`,
  `autopilot-engine.ts`). No React, no device. Engines are self-contained and
  never import from one another; where two algorithms share a shape (Goon reuses
  Groove's dip), the helpers are **duplicated**, not shared — a deliberate
  boundary so each algorithm stays standalone.
- a **panel** — the React surface (`src/components/algorithms/*-panel.tsx`). It
  **owns** its engine instance (a `useRef`), arms/plays the shared Player with it,
  holds its own knob state (setting the engine's fields directly), and reads the
  shared Player view for the sparkline, timeline and current state.

There is no per-algorithm hook and no central runner: the panel drives the Player
directly, and mutual exclusion falls out of the Player holding one engine at a
time. Adding an algorithm is a new engine + panel plus one `<Panel>` and one tab
in `page.tsx` — nothing else wires up.

**Commands are declared once.** Each action is a `Command` — `{ word, enabled,
run }` — so the on-screen button and the spoken keyword call the same `run` and
share the same `enabled` (a disabled control is also out of the grammar). The
panel renders a button from each command and hands the list to `useVoiceCommands`
(`src/hooks/use-voice-commands.ts`), which registers the enabled words with the
recognizer and routes detections back — but only while the panel is the active
tab. A button flashes when its word is recognized.

## Shared device, one Player, mutual exclusion

Every algorithm shares one device **and** one Player via `useVacuglideDevice`
(`src/hooks/use-vacuglide-device.ts`), which wraps the `src/lib/vacuglide-device.ts`
API client and owns the single `Player`. An engine reaches the device only
indirectly, through the Player. `usePlayer` (`src/hooks/use-player.ts`) mirrors the
Player's live state into React once, at the top of the page, and passes that view
down to the panels (sparkline, current speed, timeline position/rate, and which
engine is currently the Player's `source`).

**Mutual exclusion is a Player invariant, not a coordinator.** The Player holds
one engine at a time; a panel arming its engine replaces whoever was there. A
panel knows it's the active source by comparing the Player view's `source` to its
own engine, so only the active algorithm's controls and voice words are live.

`page.tsx` keeps the two genuinely global concerns. First, the tab lock: while a
session runs, the other algorithm tabs are disabled (the running one's tab and
Settings stay reachable). Second, the global voice words — `connect`, and while
idle a switch word per algorithm — which it sets on the recognizer and routes
itself (`connect` drives the device; a switch word brings that algorithm's tab
up). Everything else is an algorithm word, owned by the active panel.

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
grammar constrained to the words valid right now — the active algorithm's enabled
words plus the global words (`connect`, and while idle a switch word per
algorithm) — rebuilt whenever that word set changes. Detections fire from vosk's
settled per-utterance result (the `result` event; streaming partials are ignored).
The ~40 MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is
fetched on load and cached by the browser.

There is **one** recognizer, owned by `KeywordSpotterProvider`
(`src/components/keyword-spotter.tsx`) at the top of the tree, so it keeps
listening across tab switches. Its grammar is two slots: the **global** words
(the page sets these via `setGlobalWords`) and the **algorithm** words (the active
panel sets these via `setAlgorithmKeywords`, through `useVoiceCommands`). Any
component subscribes to detections with `keywordListener`: the page's listener
logs every recognised word and handles `connect`/switch, while each active panel's
listener runs its own commands. Because only the active panel registers its words,
exactly one algorithm's commands are ever live.

Switch words are just the algorithm tab names (`goon`, `groove`, `autopilot`) —
say one while idle to bring that tab up (which also points voice `start` at it).
