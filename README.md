# Autogoon — voice-controlled gooning

<p align="center">
  <img src="./docs/screenshot.png" alt="Autogoon's home screen: device connection, the play mode chooser, and the getting-started notes" width="420">
</p>

Autogoon drives an Autoblow
[Vacuglide or Vacuglide 2](https://developers.autoblow.com/reference/http-api-v1-vacuglide/)
stroker from your browser, **entirely by voice**.

## For users

**▶ Try it now: [autogoon.vercel.app](https://autogoon.vercel.app/)** — nothing
to install; just open it and enter your device token.

- **Hands-free from start to finish** — just say what you want to happen, any
  time. Tap **Listen** once.
- **No app, no wearable** — it all runs in this one browser tab.
- **Private by default** — speech recognition runs entirely on your machine;
  only device-control traffic leaves it.
- **Four play modes**, each steered live by voice:
  - **[Goon](./modes/GOON.md)** — an automatic slow build over a session length
    you choose, with an intensity dial and faster/slower time-stretch.
  - **[Groove](./modes/GROOVE.md)** — a manual stroke pattern you shape live
    (intensity + dip and timing variability).
  - **[Autopilot](./modes/AUTOPILOT.md)** — a faithful recreation of Autoblow's
    own Vacuglide autopilot.
  - **[Companions](./modes/COMPANIONS.md)** — an AI companion who talks back and
    drives the toy themselves; needs your own keys today.
- **Switch by voice** — from home, say a mode's name to enter it; while stopped,
  say exit to come back and choose another. Once running, the mode locks in.

### Companions — someone to talk to

Talk to an AI companion. They chat back in their own voice, remember the
conversation, and drive the toy themselves. They speak unprompted too, not only
in reply. Going quiet doesn't end the conversation.

**Companions isn't usable on the public app yet.** Chat, voice and hearing are
paid cloud services. On a deploy the mode sits behind an access ID and stays
hidden without one. Run the dev server with your own keys and it's there, no ID
needed. [modes/COMPANIONS.md](./modes/COMPANIONS.md) covers setup, pictures and
videos. **Coming to the hosted app** once those services run on
[keys you enter in the app](./TODO.md#bring-your-own-api-keys) rather than the
server's.

### Goonpacks — a companion in a zip

A [goonpack](./GOONPACKS.md) is one companion as a file, imported straight into
the app. A pack carries:

- their persona;
- their voice;
- their colour;
- their own pictures and videos.

A pack is either a complete new companion or an overlay on one you already have,
adding media or swapping a voice or persona.

**A companion with a pack will send you pictures and videos.** Ask for what you
want in words. They search their own set, send one that fits, and never send the
same one twice in a conversation. The search reads text written when the pack
was built. Nothing is sent to a vision model mid-play.

Assembling a pack is plain-text work, no coding. [GOONPACKS.md](./GOONPACKS.md)
is the guide, with a worked example in the repo.

### Privacy

Everything runs in your browser; the only thing that leaves your machine is the
control traffic to Autoblow's cloud API for the device itself.

The exception is **Companions**, which can't be local-only: during play your
speech is transcribed by a cloud STT service, and the companion's replies come
from a cloud LLM and TTS voice.

### Running hands-free (mobile caveats)

The controlling tab has to stay **foregrounded and awake** — it runs the timing
loop and the microphone continuously, and mobile browsers suspend or heavily
throttle background or screen-locked tabs, which stops both.

- **iOS Safari** — the moment the tab is backgrounded or the screen locks, the
  play mode and the mic stop. In practice you need a **second device** dedicated
  to Autogoon (screen on, tab in front) while you use the toy. This is the only
  tested configuration.
- **iOS Chrome / Firefox / any iOS browser** _(untested)_ — expected to behave
  exactly like iOS Safari: Apple requires every iOS browser to use the system
  WebKit engine.
- **Android Chrome** _(untested)_ — likely more forgiving in the foreground with
  the screen on (different engine), but background/locked tabs are still
  throttled. A single device _may_ work if you keep the tab in front and the
  screen awake (e.g. Screen Wake Lock).

## For developers

### The app

A Next.js single-page app (App Router, TypeScript, Tailwind) with **no accounts
and no server-side database** — your device token, settings and conversations
live in your browser and nowhere else. Speech recognition is
[vosk](https://github.com/ccoreilly/vosk-browser) (WASM Kaldi) running fully
in-browser; the only server-side pieces serve Companions — thin proxies for its
chat, voice and hearing, there purely so the API keys never reach the client,
plus the check that validates an access ID.

### Documentation

- [DEVELOPERS.md](./DEVELOPERS.md) — start here: running Autogoon locally,
  building it, and contributing.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the app is put together.
- [MODES.md](./MODES.md) — the play modes, each with its own doc under
  [`modes/`](./modes/).

## License

[MIT](./LICENSE).
