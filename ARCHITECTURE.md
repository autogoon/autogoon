# Architecture

A single-page app with a sticky header bar and a shallow navigation hierarchy: a
top-level tab strip of **Home** (the device connection, the play mode chooser
and the getting-started notes), **Changes** (the changelog) and **Settings**
(appearance, safe word, Companions access, build info), with one screen per play
mode below Home — Goon, Groove, Autopilot, and the access-gated Companions.
`src/app/page.tsx` owns the layout: it wraps everything in the keyword-spotter
provider, mirrors the one shared Player into React once, and renders every
screen. Hidden screens stay mounted (only their visibility changes), so the
recognizer and the running play mode keep going regardless of which screen is
visible.

## The program / player model

The core of the app is a split between **generating** a program and **playing**
it. Everything device-facing goes through this.

**A program is a single array of timed events** over "program-time" (ms), with
one cursor marking where the clock is now. There is no separate "history":
events before the cursor are the past, events after it are the future, in the
same array. The event shapes (speed events and valve open/close pairs — a pulse
is two events, so a fixed pulse and a variable hold share one representation)
are defined and commented in [`src/lib/program.ts`](./src/lib/program.ts), along
with the transport constants.

**The Player** (`src/lib/player.ts`) plays a program and is the only thing that
touches the device's motion commands: it owns the program-clock, the tick loop,
the playback rate, device sends, keeping the future built ahead, and transport.
It knows nothing about any specific play mode. There is **one** Player, owned by
the device hook; it plays whichever play mode is active. Its methods and
constants are commented in place — read `player.ts` and `program.ts` before
touching either.

The Player carries a `state` — `armed` / `playing` / `paused`. The visible play
mode **arms** the Player (`arm`), building a live preview before Start (Goon
defers arming to its setup view's Play, which commits the setup first); Start
(`play`) then **resumes** from the held position rather than restarting, Stop
(`pause`) holds position, and `reset` restores the play mode's default knobs and
regenerates from the beginning.

**A PlayModeEngine** (`src/lib/play-modes/*-engine.ts`) is what each play mode
_is_ here: a generation-only object — no React, no device, no clock of its own;
the Player calls back into it. The four-method contract lives in
[`src/lib/program.ts`](./src/lib/program.ts) (the best-commented file in the
repo — start there). The design why: generation is split into two channels,
`generateSpeed` (the stateful backbone, pulled a batch at a time so looping play
modes never materialise all at once) and `generateValves` (a **pure** overlay
laid across a span of already-built speed). Pure matters — it lets the Player
re-lay the valve overlay over an unchanged speed script for a valve-only knob,
and it's why the overlay must not keep cadence state.

**How a change reaches the device** — two directions:

- _Magnitude_ knobs (Goon's intensity, Groove's Speed %) live in `scale()`,
  which the Player runs at send time every tick — the next tick picks the new
  value up, no regeneration.
- _Shape_ changes (Groove's Variability, Autopilot's intensity/edge) and program
  rewrites (`cumming`, Autopilot's finish) update engine state and then the
  Player `invalidateFuture()`s — it drops the events after the cursor and
  re-pulls both channels. _Valve-only_ changes (Autopilot's vacuum maintenance)
  instead call `invalidateValves()`, which keeps the speed script byte-identical
  and only re-lays the valve overlay. Regeneration only ever rewrites the
  future, never the past.

**Position = the clock.** Goon's build is a _position_, and that position **is**
the Player's clock; time dilation is the Player's rate. So
`forward`/`back`/`finish`/`faster`/`slower` are just the Player moving or
consuming the clock, and the engine samples its curves at each event's
program-time — a jump needs no special handling.

**Manual valve control** rides the live program: `vacuglide.valvePlus` /
`valveMinus` insert an open (on press) and a close (on release) event via
`Player.insertEvent` while something is playing, and drive the device directly
when nothing is.

## Two layers per play mode

Each device-driving play mode is an **engine** and a **panel**:

- the **engine** — a plain-TS `PlayModeEngine` in `src/lib/play-modes/` that
  only _generates_ events and _scales_ them. Engines are self-contained and
  never import from one another; where two play modes share a pattern (Goon
  reuses Groove's dip), the helpers are **duplicated**, not shared — a
  deliberate boundary so each play mode stays standalone.
- the **panel** — the React surface in `src/components/play-modes/` (a single
  `*-panel.tsx`, or a `*-panel/` directory with the panel in `index.tsx` once it
  splits out per-concern pieces, as Goon and Companions do). It **owns** its
  engine instance (a `useRef`), arms/plays the shared Player with it, holds its
  own knob state (setting the engine's fields directly), and reads the shared
  Player view for the sparkline, timeline and current state.

There is no per-play-mode _Player_ hook and no central runner: the panel drives
the Player directly, and mutual exclusion falls out of the Player holding one
engine at a time. (Companions is the one mode that's more than the pair — its
engine and panel sit on a whole voice/LLM subsystem; see below.) Adding a play
mode is a new engine + panel, then registering it in `page.tsx` (a `PLAY_MODES`
entry and its panel rendered) — the registry is the single source of truth, so
the home listing, the voice switch word and the screen all follow automatically.
The step-by-step lives in [DEVELOPERS.md](./DEVELOPERS.md#adding-a-play-mode).

**Commands are declared once.** Each action is a `Command`
(`src/hooks/use-voice-commands.ts`), so the on-screen button and the spoken
keyword call the same `run` and share the same `enabled` — a disabled control is
also out of the grammar. The panel renders a button from each command and hands
the list to `useVoiceCommands`, which registers the enabled words with the
recognizer and routes detections back — but only while the panel is the active
screen. A button flashes when its word is recognized.

## Shared device, one Player, mutual exclusion

Every play mode shares one device **and** one Player via `useVacuglideDevice`
(`src/hooks/use-vacuglide-device.ts`), which wraps the
`src/lib/vacuglide-device.ts` API client, owns the single `Player`, and holds
the `pagehide` safety-stop. An engine reaches the device only indirectly,
through the Player. `usePlayer` (`src/hooks/use-player.ts`) mirrors the Player's
live state into React once, at the top of the page, and passes that view down to
the panels (sparkline, timeline position/rate, and which engine is currently the
Player's `source`).

**Mutual exclusion is a Player invariant, not a coordinator.** The Player holds
one engine at a time; a panel arming its engine replaces whoever was there. A
panel knows it's the active source by comparing the Player view's `source` to
its own engine, so only the active play mode's controls and voice words are
live.

`page.tsx` keeps the three genuinely global concerns. First, navigation: the
top-level tabs and the play mode screens form a strict hierarchy with no
sideways moves below the top level — `exit` (the word, or a breadcrumb link)
goes **up one level**, and it's locked while a session runs, so switching play
modes mid-session simply can't be expressed; stop first. A play mode with a
setup view gets a play sub-level (`Home › Goon › Play`): Play navigates down
into it, exit climbs back to setup. Screens mirror into the URL hash (`#goon`,
`#goon/play`), so the browser back button, reloads and deep-links follow the
same hierarchy — back is locked mid-session just like exit (the consumed history
entry is pushed straight back), and a `/play` deep-link lands on its setup
level, since the session it named didn't survive the reload. Second, the global
voice words — `connect` while disconnected; the (unlocked) play mode names on
home; the sibling tab words (`home`/`changes`/`settings`) on any top-level tab;
`exit` below the top level while idle — which it sets on the recognizer and
routes itself. Everything else is a play mode word, owned by the active panel.
Third, the **safe word**: an always-on hard stop (`src/lib/safe-word.ts`) wired
at the page level so no play mode can ever gate it — it stays in the grammar
even for outcomes that deliberately ignore Stop.

## Controls

The header bar (`src/components/header-bar.tsx`) holds the shared top-strip
controls — the Listen toggle (keyword spotting), the device Connect button, and
live device status pills. Start/Stop/Reset live in each panel's
`SessionControls`, so Connect stays global while transport is per-play-mode. The
rest of the shared UI lives in `src/components/` (cards, sliders, the
press-and-hold Stroke buttons, and `Sparkline` — the glanceable step-line of
upcoming speed, fed by the Player's upcoming-window and redrawn each tick).

## Device API

`src/lib/vacuglide-device.ts` talks directly to the
[Vacuglide HTTP API](https://developers.autoblow.com/reference/http-api-v1-vacuglide/):
a latency service first locates the device's regional cluster, then the client
verifies the device and drives the speed and valve endpoints on that cluster —
the endpoints are listed in the client itself, which links the official
reference. All requests carry the device token header; the API is rate limited
(`x-ratelimit-*` response headers, mirrored into the client's accounting), and
the device token is remembered in `localStorage`.

## Keyword spotting

In-browser speech keyword detection using
[vosk-browser](https://github.com/ccoreilly/vosk-browser) (WASM Kaldi) with a
grammar constrained to the words valid right now, rebuilt whenever that word set
changes. Command detections fire only from vosk's settled per-utterance result
(the `result` event); streaming partials never fire commands, but are exposed to
subscribers (`partialListener`) for live feedback like the safe-word test. The
~40 MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is fetched
on load and cached by the browser.

There is **one** recognizer, owned by `KeywordSpotterProvider`
(`src/components/keyword-spotter.tsx`) at the top of the tree, so it keeps
listening across screen changes. Its grammar has three slots: the **global**
words (the page sets these via `setGlobalWords`), the **play mode** words (the
active panel sets these via `setPlayModeKeywords`, through `useVoiceCommands`),
and an **exclusive test word** that temporarily narrows the grammar to a single
word (the safe-word Test button). Any component subscribes to detections with
`keywordListener`: the page's listener logs every recognised word and handles
the global words, while each active panel's listener runs its own commands.
Because only the active panel registers its words, exactly one play mode's
commands are ever live.

Switch words are just the play mode names — say one on home to enter that play
mode's screen (Companions only once its access ID has unlocked it — or any time
on the dev server, where the gate is open). The tab words
(`home`/`changes`/`settings`) move sideways between the top-level tabs; `exit`
(while nothing runs) goes up one level.

## Companions' voice subsystem

Companions is the one play mode with a cloud pipeline behind it: live speech
transcription, an LLM turn loop with device tools, and streamed text-to-speech,
orchestrated by `src/hooks/use-voice-session.ts` over `src/lib/voice/`,
`src/lib/llm/` and `src/lib/companions/`, with the paid server routes under
`src/app/api/` gated by the Companions access ID — fail-closed in
builds/deploys, open on the dev server. The design and rationale live in
[modes/COMPANIONS.md](./modes/COMPANIONS.md).

## Goonpacks

Companions arrive as [goonpacks](./GOONPACKS.md) — one companion per zip. The
shape worth knowing:

- **One import pipeline, run at every load.** The zip bytes are the source of
  truth, stored per `id@version` in IndexedDB (`src/lib/goonpacks/store.ts` —
  bytes, not Blobs; some WebKit builds reject Blob puts). Every app load re-runs
  the same `parsePack` the importer and `goonpack:build` use over every stored
  zip, so "installed" is re-derived against the current rules, never trusted
  from a cached index — a pack that fails lists as incompatible with its
  reasons, and comes back when the cause is fixed.
- **A pure lib under a stateful hook.** `src/lib/goonpacks/` (manifest
  parsing/validation, zip parsing, shared-prompt fill, pack→`Companion`
  resolution, chooser entries) is React-free and unit-tested.
  `src/hooks/use-goonpack-library.ts` owns everything stateful: the reindex, the
  cross-pack rules a zip can't know about itself (its base being installed, a
  built-in's id being squatted), and the object-URL lifecycle for pack pictures.
- **The id means the same companion.** Storage keys carry the version so
  versions install side by side, but a resolved companion keeps the unversioned
  pack id — conversation threads belong to that id, so they survive version
  switches, and an overlay reads and writes its **base's** thread. Sent pictures
  persist as stable `goonpack:` refs resolved against whatever's loaded, never
  copied.
- **Two surfaces.** Pack admin (import, per-version rows, remove) is the
  Goonpacks tab (`src/components/goonpacks-panel.tsx`); choosing what plays is
  the Companions chooser, whose base/overlay pickers feed `resolveVariant` —
  producing the one fully-resolved `Companion` object the voice session
  consumes.
