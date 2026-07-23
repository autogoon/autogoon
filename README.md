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
  - **[Goon](./modes/GOON.md)** — an automatic slow build over a session length
    you choose (10–120 min), with an intensity dial and faster/slower
    time-stretch.
  - **[Groove](./modes/GROOVE.md)** — a manual stroke pattern you shape live
    (intensity + dip and timing variability).
  - **[Autopilot](./modes/AUTOPILOT.md)** — a faithful recreation of Autoblow's
    own Vacuglide autopilot.
  - **[Companions](./modes/COMPANIONS.md)** — talk to an AI companion who chats
    back in her own voice, remembers the conversation, and drives the toy
    herself. Access-gated — her doc covers unlocking.
- **Companions send pictures** — bring your own: during a call she picks the one
  that fits the moment by its caption, so no image ever goes to a vision model
  mid-call. Setup in [modes/COMPANIONS.md](./modes/COMPANIONS.md#pictures).
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

A Next.js single-page app (App Router, TypeScript, Tailwind) with **no accounts
and no server-side database** — your device token, settings and conversations
live in your browser and nowhere else. Speech recognition is
[vosk](https://github.com/ccoreilly/vosk-browser) (WASM Kaldi) running fully
in-browser; the only server-side pieces are thin API proxies for Companions'
voice and chat, there purely so the API keys never reach the client.

Running it yourself, building it, or contributing? Start at
[DEVELOPERS.md](./DEVELOPERS.md); how it's put together is
[ARCHITECTURE.md](./ARCHITECTURE.md).

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
