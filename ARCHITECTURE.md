# Architecture

A single-page app with a sticky header bar and a shallow navigation hierarchy: a
top-level tab strip of **Home** (the device connection, the play mode chooser
and the getting-started notes), **Goonpacks** (pack admin), **Changes** (the
changelog) and **Settings** (appearance, safe word, Companions access, build
info), with one screen per play mode below Home — Goon, Groove, Autopilot, and
the access-gated Companions. `src/app/page.tsx` owns the layout: it wraps
everything in the keyword-spotter provider, mirrors the one shared Player into
React once, and renders every screen. Hidden screens stay mounted (only their
visibility changes), so the recognizer and the running play mode keep going
regardless of which screen is visible.

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
touches the device's motion commands. It owns:

- the program-clock;
- the tick loop;
- the playback rate;
- device sends;
- keeping the future built ahead;
- transport.

Nothing in it is specific to a play mode. There is **one** Player, owned by the
device hook; it plays whichever play mode is active. Its methods and constants
are commented in place — read `player.ts` and `program.ts` before touching
either.

The Player carries a `state` — `armed` / `playing` / `paused`. The visible play
mode **arms** the Player (`arm`), building a live preview before Start (Goon and
Companions defer arming until their setup view enters play, which commits the
setup first); Start (`play`) then **resumes** from the held position rather than
restarting, Stop (`pause`) holds position, and Reset re-arms the program from
the beginning (Reset is two layers — see [Play modes](#play-modes)).

**A PlayModeEngine** (`src/lib/play-modes/*-engine.ts`) is what each play mode
_is_ here: a generation-only object — no React, no device, no clock of its own;
the Player calls back into it. The four-method contract lives in
[`src/lib/program.ts`](./src/lib/program.ts) (the best-commented file in the
repo — start there). Generation is split into two channels: `generateSpeed`
(stateful, pulled a batch at a time so looping play modes never materialise all
at once) and `generateValves` (a **pure** overlay laid across a span of
already-built speed). Purity lets the Player re-lay the valve overlay over an
unchanged speed script for a valve-only knob, and is why the overlay must not
keep cadence state.

**How a change reaches the device** — two kinds:

- _Magnitude_ knobs (Goon's and Groove's intensity) live in `scale()`, which the
  Player runs at send time every tick — the next tick picks the new value up, no
  regeneration.
- _Shape_ changes (Groove's Variability, Autopilot's intensity/edge) and program
  rewrites (`cumming`, Autopilot's finish) update engine state and then the
  Player `invalidateFuture()`s — it drops the events after the cursor and
  re-pulls both channels. _Valve-only_ changes (Autopilot's vacuum maintenance)
  instead call `invalidateValves()`, which keeps the speed script byte-identical
  and only re-lays the valve overlay. Regeneration only ever rewrites the
  future, never the past.

Generation has random elements, so regenerating for a magnitude change would
switch the user to a fresh pattern instead of rescaling the one they are already
feeling.

**Position = the clock.** Goon's build is a _position_, and that position **is**
the Player's clock; time dilation is the Player's rate. So
`forward`/`back`/`finish`/`faster`/`slower` are just the Player moving or
consuming the clock, and the engine samples its curves at each event's
program-time — a jump needs no special handling.

**Manual valve control** rides the live program: `vacuglide.valvePlus` /
`valveMinus` insert an open (on press) and a close (on release) event via
`Player.insertEvent` while something is playing, and drive the device directly
when nothing is.

## Play modes

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
engine and panel sit on a whole voice/LLM subsystem; see
[Companions' voice subsystem](#companions-voice-subsystem).) Adding a play mode
is a new engine + panel, then registering it in `page.tsx` (a `PLAY_MODES` entry
and its panel rendered) — the registry is the single source of truth, so the
home listing, the voice switch word and the screen all follow automatically.

What is easy to get wrong about the pair, and not visible from one file:

- **The engine instance is never re-created.** The Player identifies the active
  source by comparing references, so a panel that rebuilds its engine — a
  `useMemo` with deps, say — stops being the active source, with nothing raised.
  That is what the `useRef` is for.
- **Reset is two layers.** A panel's reset restores its knobs' React state and
  their engine defaults and re-arms; the Player then rebuilds from the start and
  calls `engine.reset()` to clear transient state — a pending `cumming`, say.
  Neither layer does the other's half.
- **An ending belongs to the panel.** `StrokeCard` is only the shared stroke ±
  buttons; a play mode with an ending renders `FinishButton` and/or
  `CummingButton` itself. **Finish** (a _pre_-ending — reach and hold the climax
  point) and **Cumming** (the send-off) are distinct actions, and a play mode
  may have both, one or neither.
- **A setup view is the panel's own choice**, not part of the shape: Goon and
  Companions have one and defer arming to it, Groove and Autopilot arm as soon
  as their screen is active.

Read a working pair before writing one. `goon-engine.ts` + `goon-panel/`
exercise the full set:

- an automatic build curve;
- a setup view with per-concern option cards;
- a live-scaled magnitude knob;
- valve teases;
- time dilation;
- a bespoke `cumming` wind-down.

`groove-engine.ts` + `groove-panel.tsx` are the leaner model, for a play mode
driven by manual knobs.

## Commands

**Each action is declared once.** A `Command`
(`src/hooks/use-voice-commands.ts`) carries one `run` and one `enabled`, and
both the on-screen button and the spoken keyword go through them — so a disabled
control is also out of the grammar. The panel hands the list to
`useVoiceCommands`, which registers the enabled words with the recognizer and
routes detections back, but only while the panel is the active screen. A
command's control is usually a button, which flashes when its word is
recognized, but not always — Groove's `more` and `less` step a slider.

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
sideways moves below the top level. The Goonpacks tab is in the strip only when
Companions is available, on the same condition — an access ID, or the dev
server. `exit` (the word, or a breadcrumb link) goes **up one level**, and it's
locked while a session runs, so switching play modes mid-session can't be
expressed; stop first. A play mode with a setup view gets a play sub-level
(`Home › Goon › Play`): Play navigates down into it, exit climbs back to setup.
Screens mirror into the URL hash (`#goon`, `#goon/play`), so the browser back
button, reloads and deep-links follow the same hierarchy — back is locked
mid-session just like exit (the consumed history entry is pushed straight back),
and a `/play` deep-link lands on its setup level, since the session it named
didn't survive the reload. One screen opts out of the chrome: Companions' play
screen hides the header bar and breadcrumb and draws its own slim bar — a
back-to-picker button under the same lock, the mic, and a hamburger for the
panel's sub-tabs — so the chat gets the screen. Second, the global voice words,
which it sets on the recognizer and routes itself —
[Keyword spotting](#keyword-spotting) lists them, and the effect in `page.tsx`
builds them. Everything else is a play mode word, owned by the active panel.
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
and the client tracks that limit locally, because the `x-ratelimit-*` headers
are not exposed cross-origin — the comment at `RATE_LIMIT` in
`src/lib/vacuglide-device.ts` records how the window's shape was established.
The device token is remembered in `localStorage`.

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

Switch words are just the play mode names — say one on home to enter that play
mode's screen (Companions only once its access ID has unlocked it — or any time
on the dev server, where the gate is open). The tab words
(`home`/`changes`/`settings`) move sideways between the top-level tabs, joined
by `packs` whenever the Goonpacks tab shows — it answers to `packs` rather than
its own name, for the reason given at `TabId` in `page.tsx`. `exit` (while
nothing runs) goes up one level. `connect` is in the grammar while the device is
disconnected.

## Companions' voice subsystem

Companions is the one play mode with a cloud pipeline behind it: live speech
transcription, an LLM turn loop with device tools, and streamed text-to-speech,
orchestrated by `src/hooks/use-voice-session.ts` over `src/lib/voice/`,
`src/lib/llm/` and `src/lib/companions/`, with the paid server routes under
`src/app/api/` gated by the Companions access ID — fail-closed in
builds/deploys, open on the dev server. The design and rationale live in
[modes/COMPANIONS.md](./modes/COMPANIONS.md).

One invariant is worth stating here, because it spans the mic, the socket and
the billing model. **Audio is streamed only while an utterance is in flight**,
and **we never close the STT socket on idle**:

- The gate opens at the VAD's onset and closes on the server's _committed
  transcript_ — not on the VAD's offset. `commit_strategy=vad` means ElevenLabs'
  own VAD decides the utterance ended, and it needs to hear the trailing silence
  to do it; cut the audio at our offset and the commit never arrives, so the
  turn never runs. That commit is the app's authoritative end-of-speech, and
  three things hang off it: the audio gate closes, the turn is submitted, and
  the composer drops out of dictation. Nothing infers the end from local mic
  energy, which dips between words and says nothing about whether you've
  finished.
- Between utterances the socket stays up and silent. ElevenLabs bill audio
  processed, not connection uptime, so an idle socket is free — and a warm one
  means an interruption isn't waiting on a token fetch and handshake.
- Because the socket outlives a turn, the mic's pre-roll has to be flushed on a
  **warm resume** as well as at connect, or every utterance after the first
  loses its opening word.
- **Idle sockets are ElevenLabs' to close, and they do** — cleanly, with a 1000,
  after their own undocumented quiet period. There is deliberately no timeout of
  ours racing it; the next onset opens a fresh socket. The only close we make is
  the session teardown in `stop()`.

Server error messages and any close we didn't initiate are surfaced to the
panel's event log rather than swallowed — that quiet 1000 is how the idle rule
was found in the first place, and it is the only account we get.

**Ambient chat is a self-sustaining loop, not a clock.** Each companion turn
arms the next as it ends, so nothing polls for a silence to fill; the scheduler
(`src/lib/companions/ambient-scheduler.ts`) holds only that timer and a latch,
kept out of the voice session because that hook already carries refs read by
callbacks created once and outliving every render. The rules that keep it
working:

- **Scheduling is decided once, at the end of a turn, from session state** —
  never from what happened inside a generation. That's why `wait_for_user` sets
  a **latch** rather than skipping one arming: a tool call is followed by a
  reaction generation, and the arm at the end of _that_ would otherwise undo
  what the tool asked for. Only a real user turn releases it.
- **The companion decides when to stop, so nothing else needs to.** A timeout
  would fix a number to something only the conversation can settle — whether
  there is anything left to say. The cost is that a walked-away session keeps
  generating turns until the companion stops on its own, which is
  [Activity cutoff](./TODO.md)'s to solve.
- **The scheduler is wall-clock and belongs to the session, never the program.**
  Program events are dropped on every regeneration and scale with playback rate,
  and neither should touch the cadence. The Player's state is read for one
  purpose only — whether the delay is drawn from the companion's playfulness or
  their chattiness — and never gates whether the companion speaks at all.

An ambient turn runs the ordinary turn path with no user turn appended; its cue
rides that one request as a transient system line, like a gap marker, so it
prompts the companion without accumulating in the thread.

## Goonpacks

Companions arrive as [goonpacks](./GOONPACKS.md) — one companion per zip. The
shape worth knowing:

- **Extracted once, verified at every load.** A pack is unzipped at import into
  one OPFS directory tree per `id@version`
  ([`src/lib/goonpacks/store.ts`](./src/lib/goonpacks/store.ts)); a marker file
  written last is what makes the tree an installed pack, so an interrupted
  import and an interrupted removal leave the same state, and one clean pass at
  load deletes both. Nothing derived is persisted anywhere: every load re-runs
  the same `parsePack` the importer and `goonpack:build` use over every tree, so
  "installed" is re-derived against the current rules, never trusted from a
  cached index — a pack that fails lists as incompatible with its reasons, and
  comes back when the cause is fixed. Media bytes are never resident: validation
  is a pass over **names** (only the manifest, the prompt and the captions are
  ever read), and a file becomes an object URL on first render, not at load.
- **Import holds a lock; extraction runs in a worker.** The zip is streamed
  straight to disk with backpressure
  ([`extract.ts`](./src/lib/goonpacks/extract.ts)), never held whole, off the
  main thread ([`extract-worker.ts`](./src/lib/goonpacks/extract-worker.ts));
  the zip is transport and isn't kept. Around the whole of it — extract,
  validate, then the marker — the importer holds a Web Lock named for the pack's
  key (`importLock` in `store.ts`), because until the marker lands, a tree being
  written is indistinguishable on disk from one an interrupted import left
  behind. The clean pass probes each markerless tree's lock and deletes only
  from inside the callback, so an import running in another tab survives the
  sweep; a crashed one needs no timeout, since the browser releases the lock
  with the tab.
- **A pure lib under a stateful hook.** `src/lib/goonpacks/` (manifest
  parsing/validation, tree validation, the library index and its cross-pack
  rules, shared-prompt fill, pack→`Companion` resolution, chooser entries) is
  React-free and unit-tested — [`library.ts`](./src/lib/goonpacks/library.ts)
  takes its tree source as an argument, which is how the whole load pass is
  tested without OPFS.
  [`src/hooks/use-goonpack-library.ts`](./src/hooks/use-goonpack-library.ts) is
  the React face of one session-wide index: the Companions chooser and the
  Goonpacks tab both hold the hook, and a media file's object URL is held until
  its pack is removed or re-imported.
- **The id means the same companion.** Storage keys carry the version so
  versions install side by side, but a resolved companion keeps the unversioned
  pack id — conversation threads belong to that id, so they survive version
  switches, and an overlay reads and writes its **base's** thread. Sent pictures
  and videos persist as stable `goonpack:` refs resolved against whatever's
  loaded, never copied.
- **Two surfaces.** Pack admin (import, per-version rows, remove) is the
  Goonpacks tab (`src/components/goonpacks-panel.tsx`); choosing what plays is
  the Companions chooser, whose base/overlay pickers feed `resolveVariant` —
  producing the one fully-resolved `Companion` object the voice session
  consumes.
