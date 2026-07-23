# Autogoon — voice-controlled gooning

<p align="center">
  <img src="./docs/screenshot.png" alt="Autogoon running the Goon mode — voice command list, transport, stroke controls, timeline, and intensity dial" width="420">
</p>

Autogoon drives an Autoblow
[Vacuglide or Vacuglide 2](https://developers.autoblow.com/reference/http-api-v1-vacuglide/)
stroker from your browser, **entirely by voice**.

**▶ Try it now: [autogoon.vercel.app](https://autogoon.vercel.app/)** — nothing
to install; just open it, enter your device token, and go.

- **Hands-free from start to finish** — just say what you want to happen, any
  time. Tap **Listen** once and run the whole session without touching a thing.
- **No app, no wearable** — it all runs in this one browser tab.
- **Private by default** — speech recognition runs entirely on your machine;
  only device-control traffic leaves it.
- **Four modes**, each steered live by voice:
  - **Goon** — an automatic slow build over a session length you choose (10–120
    min), with an intensity dial and faster/slower time-stretch.
  - **Groove** — a manual stroke pattern you shape live (intensity + dip and
    timing variability).
  - **Autopilot** — a faithful recreation of Autoblow's own Vacuglide autopilot.
  - **Companions** — talk to an AI companion who chats back in her own voice,
    remembers the conversation, and drives the toy herself. Access-gated — see
    [The app](#the-app).
- **Switch by voice** — say a mode's name to change while stopped; once running,
  the mode locks in.

## Privacy

Everything runs in your browser; the only thing that leaves your machine is the
control traffic to Autoblow's cloud API for the device itself. Speech
recognition runs entirely locally in your browser, so your microphone audio
never leaves your machine.

The exception is **Companions**, which can't be local-only by nature: during a
call your speech is transcribed by a cloud STT service, and her replies come
from a cloud LLM and TTS voice. The other three modes stay fully local.

## The app

_Building it yourself or contributing? See [DEVELOPERS.md](./DEVELOPERS.md)._

A Next.js app (App Router, TypeScript, Tailwind v4): a single page with a sticky
header bar — a mic **Listen** toggle (keyword spotting), device **Connect** and
live status — and a shallow navigation: a top-level tab strip of **Home**,
**Changes** (the changelog) and **Settings** (appearance, safe word, Companions
access, build info), with one screen per play mode below Home (and a play
sub-level below that for a mode with a setup view, like Goon). **Home** lists
the play modes plus device token entry and a getting-started intro; pick a play
mode by tap or by saying its name:

1. **Goon** — see [modes/GOON.md](./modes/GOON.md).
2. **Groove** — see [modes/GROOVE.md](./modes/GROOVE.md).
3. **Autopilot** — a faithful recreation of Autoblow's own autopilot; see
   [modes/AUTOPILOT.md](./modes/AUTOPILOT.md).
4. **Companions** — talk to an AI companion; see
   [modes/COMPANIONS.md](./modes/COMPANIONS.md).

**Companions is hidden behind an access key.** Its LLM, TTS and STT routes cost
real money per call, so a deploy doesn't expose them — or the mode itself — to
anyone who finds the URL. The gate is fail-closed: it only appears (and its
routes only answer) for someone who has entered a valid access ID under
Settings, from the `COMPANIONS_ACCESS_IDS` list set in the deploy's env (see
[`.env.example`](./.env.example)). Unset, Companions stays hidden everywhere,
including locally.

**Exit** — the breadcrumb's Home button, or the spoken word — goes back up.
While a session is running, Exit is locked (and leaves the grammar): you can't
leave a play mode or switch to another mid-session; stop first.

Keyword spotting uses [vosk-browser](https://github.com/ccoreilly/vosk-browser)
(WASM Kaldi). The recognizer's grammar is exactly the words valid right now: the
active play mode's enabled commands plus the global words — `connect` while
disconnected, the play mode names on home, the tab names, `exit` while idle, and
the safe word whenever anything is playing. Detections fire from vosk's settled
per-utterance result (the `result` event); commands never fire from streaming
partials.

## Running hands-free (mobile caveats)

The controlling tab has to stay **foregrounded and awake** — it runs the timing
loop and the microphone continuously, and mobile browsers suspend or heavily
throttle background or screen-locked tabs, which stops both.

- **iOS Safari** — strict: the moment the tab is backgrounded or the screen
  locks, the play mode and the mic stop. In practice you need a **second
  device** dedicated to Autogoon (screen on, tab in front) while you use the
  toy. This is the only tested configuration.
- **iOS Chrome / Firefox / any iOS browser** _(untested)_ — expected to behave
  exactly like iOS Safari: Apple requires every iOS browser to use the system
  WebKit engine, so they inherit the same background-tab and media limits.
- **Android Chrome** _(untested)_ — likely more forgiving in the foreground with
  the screen on (different engine), but background/locked tabs are still
  throttled. A single device _may_ work if you keep the tab in front and the
  screen awake (e.g. Screen Wake Lock) — unverified.

## Documentation

- [DEVELOPERS.md](./DEVELOPERS.md) — running Autogoon locally and contributing.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the app is put together: the
  program/player model, the engine/panel split, the shared device layer and
  single Player, the keyword spotter, and the Vacuglide HTTP API.
- [MODES.md](./MODES.md) — the play modes, each with its own doc under
  [`modes/`](./modes/).

## License

[MIT](./LICENSE).
