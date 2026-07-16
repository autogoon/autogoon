# Autogoon — voice-controlled gooning

<p align="center">
  <img src="./docs/screenshot.png" alt="Autogoon running the Goon mode — voice command list, transport, stroke controls, timeline, and intensity dial" width="420">
</p>

Autogoon drives an Autoblow
[Vacuglide or Vacuglide 2](https://developers.autoblow.com/reference/http-api-v1-vacuglide/)
stroker from your browser, **entirely by voice**.

**▶ Try it now: [autogoon.vercel.app](https://autogoon.vercel.app/)** — nothing to
install; just open it, enter your device token, and go.

- **Hands-free from start to finish** — just say what you want to happen, any
  time. Tap **Listen** once and run the whole session without touching a thing.
- **No app, no wearable** — it all runs in this one browser tab.
- **Private by default** — speech recognition runs entirely on your machine; only
  device-control traffic leaves it.
- **Three modes**, each steered live by voice:
  - **Goon** — an automatic slow build over a session length you choose
    (10–120 min), with an intensity dial and faster/slower time-stretch.
  - **Groove** — a manual stroke pattern you shape live (intensity + dip and
    timing variability).
  - **Autopilot** — a faithful recreation of Autoblow's own Vacuglide autopilot.
- **Switch by voice** — say a mode's name to change while stopped; once running,
  the mode locks in.

## Privacy

Everything runs in your browser; the only thing that leaves your machine is the
control traffic to Autoblow's cloud API for the device itself. Speech recognition
runs entirely locally in your browser, so your microphone audio never leaves your
machine.

## The app

_Building it yourself or contributing? See [DEVELOPERS.md](./DEVELOPERS.md)._

A Next.js app (App Router, TypeScript, Tailwind v4): a single page with a sticky
header bar — a mic **Listen** toggle (keyword spotting), device **Connect**, live
status, and a **Stop** button while an algorithm runs — and four tabs, one per
algorithm plus settings:

1. **Goon** (the default tab) — see [ALGORITHM-GOON.md](./ALGORITHM-GOON.md).
2. **Groove** — see [ALGORITHM-GROOVE.md](./ALGORITHM-GROOVE.md).
3. **Autopilot** — a faithful recreation of Autoblow's own autopilot; see
   [ALGORITHM-AUTOPILOT.md](./ALGORITHM-AUTOPILOT.md).
4. **Settings** — an intro to the app, device token entry, and appearance (theme).

While an algorithm is running the other algorithm tabs are disabled (and their
voice switch words leave the grammar) — you can't switch algorithms mid-session,
by tab or by voice; stop first. The running algorithm's own tab and Settings stay
reachable.

Keyword spotting uses [vosk-browser](https://github.com/ccoreilly/vosk-browser)
(WASM Kaldi). The recognizer's grammar is exactly the running algorithm's
published commands plus the global words valid right now (`connect`/`start`/`stop`,
and while stopped a switch word per algorithm), and detections fire from vosk's
settled per-utterance result (the `result` event; streaming partials are ignored).

## Running hands-free (mobile caveats)

The controlling tab has to stay **foregrounded and awake** — it runs the timing
loop and the microphone continuously, and mobile browsers suspend or heavily
throttle background or screen-locked tabs, which stops both.

- **iOS Safari** — strict: the moment the tab is backgrounded or the screen locks,
  the algorithm and the mic stop. In practice you need a **second device**
  dedicated to Autogoon (screen on, tab in front) while you use the toy. This is
  the only tested configuration.
- **iOS Chrome / Firefox / any iOS browser** _(untested)_ — expected to behave
  exactly like iOS Safari: Apple requires every iOS browser to use the system
  WebKit engine, so they inherit the same background-tab and media limits.
- **Android Chrome** _(untested)_ — likely more forgiving in the foreground with
  the screen on (different engine), but background/locked tabs are still throttled.
  A single device _may_ work if you keep the tab in front and the screen awake
  (e.g. Screen Wake Lock) — unverified.

## Documentation

- [DEVELOPERS.md](./DEVELOPERS.md) — running Autogoon locally and contributing.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the app is put together: the
  program/player model, the engine/panel split, the shared device layer and single
  Player, the keyword spotter, and the Vacuglide HTTP API.
- [ALGORITHM-GOON.md](./ALGORITHM-GOON.md) — the automatic slow-build algorithm.
- [ALGORITHM-GROOVE.md](./ALGORITHM-GROOVE.md) — the hand-built dip algorithm.
- [ALGORITHM-AUTOPILOT.md](./ALGORITHM-AUTOPILOT.md) — the reverse-engineered
  autopilot algorithm (mystery script, intensity, edge control, suction).

## License

[MIT](./LICENSE).
