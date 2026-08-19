# Architecture

A single-page app. `src/app/page.tsx` wraps everything in the keyword-spotter
provider, mirrors the one shared Player into React once, and renders every
screen. Hidden screens stay mounted, changing only their visibility. The
navigation hierarchy those screens form is under
[Shared device, one Player, mutual exclusion](#shared-device-one-player-mutual-exclusion).

## One path for every browser

The app targets Chromium, Firefox and WebKit. A browser-specific branch is a
last resort, not a first fix: it doubles the paths, and Playwright can't always
reach the one that needs it — its WebKit has no working OPFS, so nothing
Safari-only is tested by anything but a human.

When an API fails in one engine, the shape that works everywhere comes before a
fallback. Extraction sends the worker a pack key rather than a directory handle
because WebKit won't structured-clone the handle, and that costs the other
engines nothing. Take the branch only once no common path exists, and say in a
comment which engine forced it.

## The program / player model

Everything device-facing splits into **generating** a program and **playing**
it.

**A program is a single array of timed events** over "program-time" (ms), with
one cursor marking where the clock is now. Events before the cursor are the
past, events after it are the future.

Speed events and valve open/close pairs are defined and commented in
[`src/lib/program.ts`](./src/lib/program.ts), along with the transport
constants. A valve pulse is an open and a close, so a fixed pulse and a variable
hold share one representation.

**The Player** (`src/lib/player.ts`) plays a program and is the only thing that
drives the device while one runs. It owns:

- the program-clock;
- the tick loop;
- the playback rate;
- device sends;
- keeping the future built ahead;
- transport.

Nothing in it is specific to a play mode. There is **one**, owned by the device
hook. Its methods and constants are commented in place. Read `player.ts` and
`program.ts` before touching either.

The Player carries a `state` — `armed` / `playing` / `paused`. The transport:

- **Arm** (`arm`) — the visible play mode arms the Player, building a live
  preview before Start. Goon and Companions defer arming until their setup view
  enters play, which commits the setup first.
- **Start** (`play`) — resumes from the held position rather than restarting.
- **Stop** (`pause`) — holds position.
- **Reset** — re-arms the program from the beginning. Reset is two layers; see
  [Play modes](#play-modes).

**A PlayModeEngine** (`src/lib/play-modes/*-engine.ts`) is a generation-only
object: no React, no device, no clock of its own. The Player calls back into it.
The four-method contract is defined and commented in
[`src/lib/program.ts`](./src/lib/program.ts).

Generation is split into two channels. `generateSpeed` is stateful and is pulled
a batch at a time. A looping play mode's program is never materialised whole.
`generateValves` is a **pure** overlay laid across a span of already-built
speed. The Player re-lays the overlay over an unchanged speed script for a
valve-only knob. The overlay must therefore keep no cadence state.

**How a change reaches the device:**

- _Magnitude_ knobs (Goon's and Groove's intensity) live in `scale()`, which the
  Player runs at send time every tick. The next tick picks the new value up,
  with no regeneration.
- _Shape_ changes (Groove's two variability knobs, Autopilot's intensity/edge)
  and program rewrites (`cumming`, Autopilot's finish) update engine state and
  then the Player `invalidateFuture()`s, dropping the events after the cursor
  and re-pulling both channels.
- _Valve-only_ changes (Autopilot's vacuum maintenance) call
  `invalidateValves()` instead. It keeps the speed script byte-identical and
  re-lays only the valve overlay.

Generation has random elements. Regenerating for a magnitude change would switch
the user to a fresh pattern instead of rescaling the one they are already
feeling.

**Position = the clock.** Goon's build is a position; time dilation is the
Player's rate. `forward`/`back`/`finish`/`faster`/`slower` move or consume the
clock. The engine samples its curves at each event's program-time, so a jump
needs no special handling.

**Manual valve control** rides the live program. While something is playing,
`vacuglide.valvePlus` / `valveMinus` insert an open (on press) and a close (on
release) event via `Player.insertEvent`. When nothing is playing, they drive the
device directly.

## Play modes

Each device-driving play mode is an **engine** and a **panel**.

The **engine** is a plain-TS `PlayModeEngine` in `src/lib/play-modes/` that only
_generates_ events and _scales_ them. Engines are self-contained and never
import from one another. Where two play modes share a pattern (Goon reuses
Groove's dip), the helpers are **duplicated**, not shared — a chosen boundary.
The boundary covers _generation_ code only; shared infrastructure like the
Player sits outside it.

The **panel** is the React surface in `src/components/play-modes/` (a single
`*-panel.tsx`, or a `*-panel/` directory with the panel in `index.tsx` once it
splits out per-concern pieces, as Goon and Companions do). It **owns** its
engine instance (a `useRef`), arms/plays the shared Player with it, holds its
own knob state (setting the engine's fields directly), and reads the shared
Player view for the sparkline, timeline and current state.

There is no per-play-mode _Player_ hook and no central runner; the panel drives
the Player directly. Companions is the one play mode that is more than the pair:
its engine and panel are driven by a voice/LLM subsystem, under
[Companions' voice subsystem](#companions-voice-subsystem).

Adding a play mode is a new engine + panel, then registering it in `page.tsx` —
a `PLAY_MODES` entry, and its panel rendered. The home listing, the voice switch
word and the screen all follow from that entry.

What is easy to get wrong about the pair, and not visible from one file:

- **The engine instance is never re-created.** The Player identifies the active
  source by comparing references. A panel that rebuilds its engine — a `useMemo`
  with deps, say — stops being the active source, and no error is raised. The
  `useRef` prevents it.
- **Reset is two layers.** A panel's reset restores its knobs' React state and
  their engine defaults, then re-arms. The Player rebuilds from the start and
  calls `engine.reset()` to clear transient state, such as a pending `cumming`.
  Neither layer does the other's half.
- **An ending belongs to the panel.** `StrokeCard` is only the shared stroke ±
  buttons; a play mode with an ending renders `FinishButton` and/or
  `CummingButton` itself. **Finish** is a _pre_-ending: reach and hold the
  climax point. **Cumming** is the ending itself. A play mode may have both, one
  or neither.
- **A setup view is per panel.** Goon and Companions have one and defer arming
  to it. Groove and Autopilot arm as soon as their screen is active.

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
both the on-screen button and the spoken keyword go through them. A disabled
control is out of the grammar.

The panel passes the list to `useVoiceCommands`. It registers the enabled words
with the recognizer and routes detections back, but only while that panel's
screen is active.

A command's control is usually a button, and it flashes when its word is
recognized. Groove's `more` and `less` step a slider instead.

## Shared device, one Player, mutual exclusion

Every play mode shares one device **and** one Player via `useVacuglideDevice`
(`src/hooks/use-vacuglide-device.ts`), which wraps the
`src/lib/vacuglide-device.ts` API client, owns the single `Player`, and holds
the `pagehide` safety-stop. An engine reaches the device only through the
Player. `usePlayer` (`src/hooks/use-player.ts`) mirrors the Player's live state
into React once, at the top of the page, and passes that view down to the panels
(sparkline, timeline position/rate, and which engine is currently the Player's
`source`).

**Mutual exclusion is a Player invariant.** The Player holds one engine at a
time; a panel arming its engine replaces whatever was there. Nothing coordinates
the panels. A panel is the active source when the Player view's `source` matches
its own engine, and only the active play mode's controls and voice words are
live.

`page.tsx` keeps the global concerns.

**Navigation.** The top-level tabs and the play mode screens form a strict
hierarchy with no sideways moves below the top level. The Goonpacks tab is in
the strip only when Companions is available — an access ID, or the dev server.
The Inference tab is in it only under `npm run dev`, and has no voice word;
[INFERENCE.md](./INFERENCE.md) covers what it is.

`exit` (the word, or a breadcrumb link) goes **up one level**. It is locked
until the Player is back to `armed`, so switching play modes takes Reset, not
just Stop. `pause()` leaves the state `paused`. A play mode with a setup view
gets a play sub-level (`Home › Goon › Play`). Play navigates down into it, exit
climbs back to setup.

Screens mirror into the URL hash (`#goon`, `#goon/play`), so the browser back
button, reloads and deep-links follow the same hierarchy. Back is locked
mid-session like exit, by pushing the consumed history entry straight back. A
`/play` deep-link lands on its setup level, since a reload ends the session it
named.

Companions' play screen is the one screen without the shared chrome. It hides
the header bar and breadcrumb and draws its own slim bar: a back-to-picker
button under the same lock, the mic, and a hamburger for the panel's sub-tabs.

**The global voice words.** `page.tsx` sets them on the recognizer and routes
them itself; [Keyword spotting](#keyword-spotting) lists them. Everything else
is a play mode word, owned by the active panel.

**The safe word.** A hard stop (`src/lib/safe-word.ts`) wired at the page level,
so no play mode can gate it. It is in the grammar the whole time something is
playing, including where Stop is deliberately ignored. Anything touching the
grammar, the recognizer's lifetime, or the screens a word has to survive keeps
that true. The one case outside it is the microphone being off. No word reaches
the app at all then.

## Controls

The header bar (`src/components/header-bar.tsx`) holds the shared top-strip
controls:

- the Listen toggle (keyword spotting);
- the device Connect button;
- live device status pills.

Start/Stop/Reset live in each panel's `SessionControls`.

The rest of the shared UI lives in `src/components/` — cards, sliders, the
press-and-hold Stroke buttons, and `Sparkline`. `Sparkline` draws the Player's
upcoming-window each tick: a step-line of speed over a lane marking the
scheduled valve changes.

## Device API

`src/lib/vacuglide-device.ts` talks directly to the
[Vacuglide HTTP API](https://developers.autoblow.com/reference/http-api-v1-vacuglide/).
A latency service first locates the device's regional cluster. The client then
verifies the device and drives the speed and valve endpoints on that cluster.
The endpoints are listed in the client itself, which links the official
reference.

All requests carry the device token header. The API is rate limited, and the
client tracks that limit locally, because the `x-ratelimit-*` headers are not
exposed cross-origin. The comment at `RATE_LIMIT` records how the window's shape
was established. The device token is stored in `localStorage`.

## Keyword spotting

In-browser speech keyword detection using
[vosk-browser](https://github.com/ccoreilly/vosk-browser) (WASM Kaldi) with a
grammar constrained to the words valid right now, rebuilt whenever that word set
changes. Command detections fire only from vosk's settled per-utterance result
(the `result` event). Streaming partials never fire commands, but are exposed to
subscribers (`partialListener`) for live feedback like the safe-word test. The
~40 MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is fetched
on load and cached by the browser.

There is **one** recognizer, owned by `KeywordSpotterProvider`
(`src/components/keyword-spotter.tsx`) at the top of the tree, so it keeps
listening across screen changes. It starts when the Listen control is pressed,
or on load when the Settings preference is set (`src/lib/listen-on-load.ts`);
until then nothing is captured. Its grammar has three slots:

- the **global** words, set by the page via `setGlobalWords`;
- the **play mode** words, set by the active panel via `setPlayModeKeywords`,
  through `useVoiceCommands`;
- an **exclusive test word**, narrowing the grammar to a single word for as long
  as it is set (the safe-word Test button).

Any component subscribes to detections with `keywordListener`. The page's
listener logs every recognised word and handles the global words; each active
panel's listener runs its own commands.

Switch words are the play mode names. Say one on home to enter that play mode's
screen. The Companions switch word is in the grammar only once its access ID has
unlocked it, and always on the dev server.

The tab words (`home`/`changes`/`settings`) move sideways between the top-level
tabs, joined by `packs` whenever the Goonpacks tab shows. That tab's word is
`packs` rather than its own name, for the reason given at `TabId` in `page.tsx`.
`exit` (while nothing runs) goes up one level. `connect` is in the grammar while
the device is disconnected.

## Companions' voice subsystem

Companions is the one play mode with a cloud pipeline behind it:

- live speech transcription;
- an LLM turn loop with device tools;
- streamed text-to-speech.

`src/hooks/use-voice-session.ts` orchestrates them over `src/lib/voice/`,
`src/lib/llm/` and `src/lib/companions/`. The paid server routes under
`src/app/api/` are gated by the Companions access ID, fail-closed in
builds/deploys and open on the dev server; `api/inference` is the exception, and
is 404 outside `npm run dev`. The design and rationale live in
[modes/COMPANIONS.md](./modes/COMPANIONS.md).

**Audio is streamed only while an utterance is in flight**, and **the STT socket
is never closed on idle**:

- The gate opens at the VAD's onset and closes on the server's _committed
  transcript_, not on the VAD's offset. `commit_strategy=vad` means ElevenLabs'
  own VAD marks the end of the utterance, and it detects that from the trailing
  silence. Cut the audio at the app's offset and the commit never arrives, so
  the turn never runs. Nothing infers the end from local mic energy, which dips
  between words and does not distinguish a pause from the end of an utterance.
- That commit is the app's authoritative end-of-speech. Three things follow from
  it:

  - the audio gate closes;
  - the turn is submitted;
  - the composer drops out of dictation.

- Between utterances the socket stays up and silent. ElevenLabs bill audio
  processed, not connection uptime, so an idle socket is free. An interruption
  does not wait on a token fetch and handshake.
- Because the socket outlives a turn, the mic's pre-roll has to be flushed on a
  **warm resume** as well as at connect, or every utterance after the first
  loses its opening word.
- **Idle sockets are ElevenLabs' to close, and they do** — cleanly, with close
  code 1000, after their own undocumented quiet period. There is deliberately no
  app-side timeout closing the socket first; the next onset opens a fresh
  socket. The only close the app makes is the session teardown in `stop()`.

Server error messages and any close the app didn't initiate are surfaced to the
panel's event log rather than swallowed. The ElevenLabs idle close is how the
rule was found.

**The prompt prefix stays reusable.** A turn re-sends the whole conversation,
and prefix caching matches from the first message to the first difference.
Anything that changes per turn rides a trailing system message after the
conversation (`liveStateMessage`), never the persona prompt. One volatile value
there makes every token behind it uncacheable. Assembled prompts are filled
once, at load (`fillSharedSections`). Nothing fails when this breaks. The
Companions debug tab's "Prompt cached" row is the only symptom.

**Ambient chat re-arms itself; nothing polls.** Each companion turn arms the
next as it ends. The scheduler (`src/lib/companions/ambient-scheduler.ts`) holds
only that timer and a latch. It is kept out of the voice session because that
hook already carries refs read by callbacks created once and outliving every
render.

The rules that keep it working:

- **Scheduling is decided once, at the end of a turn, from session state** —
  never from what happened inside a generation. That is why `wait_for_user` sets
  a **latch** rather than skipping one arming. A tool call is followed by a
  reaction generation, and the arm at the end of _that_ would otherwise undo the
  suppression `wait_for_user` set. Only a real user turn releases the latch.
- **The companion decides when to stop, so nothing else needs to.** A timeout
  would fix a number to something only the conversation can settle: whether
  there is anything left to say. The cost is that a session the user has left
  keeps generating turns until the companion stops on their own.
  [Activity cutoff](./TODO.md#activity-cutoff) is where that gets solved.
- **The scheduler is wall-clock and belongs to the session, never the program.**
  Program events are dropped on every regeneration and scale with playback rate,
  and neither should touch the cadence. The Player's state is read for one
  purpose only — whether the delay is drawn from the companion's playfulness or
  their chattiness. It never gates whether the companion speaks at all.

An ambient turn runs the ordinary turn path with no user turn appended. Its cue
rides that one request as a transient system line, so the companion is prompted
without the cue accumulating in the thread.

## Goonpacks

Companions arrive as [goonpacks](./GOONPACKS.md) — one companion per zip. The
shape worth knowing:

- **Extracted once, verified at every load.** A pack is unzipped at import into
  one OPFS directory tree per `id@version`
  ([`src/lib/goonpacks/store.ts`](./src/lib/goonpacks/store.ts)). A marker file
  written last is what makes the tree an installed pack. An interrupted import
  and an interrupted removal therefore leave the same state, and one clean pass
  at load deletes both.

  Nothing derived is persisted. Every load re-runs the same `parsePack` the
  importer and `goonpack:build` use, over every tree, so "installed" is
  re-derived against the current rules. A pack that fails lists as incompatible
  with its reasons, and comes back when the cause is fixed.

  Media bytes are never resident. Validation is a pass over **names** — only the
  manifest, the prompt and the captions are ever read — and a file becomes an
  object URL on first render, not at load.

- **Import holds a lock; extraction runs in a worker.** The zip is streamed
  straight to disk with backpressure
  ([`extract.ts`](./src/lib/goonpacks/extract.ts)), never held whole, off the
  main thread ([`extract-worker.ts`](./src/lib/goonpacks/extract-worker.ts)).
  The zip itself is not stored.

  The importer holds a Web Lock named for the pack's key (`importLock` in
  `store.ts`) around extract, validate and the marker together. Until the marker
  lands, a tree being written is indistinguishable on disk from one an
  interrupted import left behind.

  The clean pass probes each markerless tree's lock and deletes only from inside
  the callback, so a tree an import in another tab is still writing is left
  alone. A crashed import needs no timeout, since the browser releases the lock
  with the tab.

- **A pure lib under a stateful hook.** `src/lib/goonpacks/` is React-free and
  unit-tested. It covers:

  - manifest parsing and validation;
  - tree validation;
  - the library index and its cross-pack rules;
  - shared-prompt fill;
  - pack→`Companion` resolution;
  - chooser entries.

  [`library.ts`](./src/lib/goonpacks/library.ts) takes its tree source as an
  argument. The whole load pass is tested without OPFS.

  [`src/hooks/use-goonpack-library.ts`](./src/hooks/use-goonpack-library.ts) is
  the React wrapper over one session-wide index. The Companions chooser and the
  Goonpacks tab both hold the hook, and a media file's object URL is held until
  its pack is removed or re-imported.

- **The id means the same companion.** Storage keys carry the version, so
  versions install side by side, but a resolved companion keeps the unversioned
  pack id. Conversation threads belong to that id and survive version switches,
  and an overlay reads and writes its **base's** thread. Sent pictures and
  videos persist as stable `goonpack:` refs resolved against whatever's loaded,
  never copied.

- **Two surfaces.** Pack admin (import, per-version rows, remove) is the
  Goonpacks tab (`src/components/goonpacks-panel.tsx`). Choosing what plays is
  the Companions chooser, whose base/overlay pickers feed `resolveVariant`. That
  produces the one fully-resolved `Companion` object the voice session consumes.
