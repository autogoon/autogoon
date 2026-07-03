# Keyword Spotting + Vacuglide Autopilot

A Next.js app (App Router, TypeScript, Tailwind v4). A single page with a
sticky header bar and four tabs:

1. **Keyword Spotting** — in-browser speech keyword detection using
   [vosk-browser](https://github.com/ccoreilly/vosk-browser) (WASM Kaldi) with a
   grammar constrained to a small word list. Detections fire from streaming
   _partial_ results for low latency. The word list is editable in the page.
2. **Autopilot** — a recreation of `fun.autoblow.com/vacuglide/autopilot`,
   talking directly to the
   [Vacuglide HTTP API](https://developers.autoblow.com/reference/http-api-v1-vacuglide/).
   See [VACUGLIDE-AUTOPILOT.md](./VACUGLIDE-AUTOPILOT.md).
3. **Homegrown** — a second, home-grown algorithm. Boilerplate for now: it
   just holds the device speed at 10. See
   [HOMEGROWN-AUTOPILOT.md](./HOMEGROWN-AUTOPILOT.md).
4. **Settings** — device token entry and appearance (theme) controls.

Keyword spotting and the algorithms are not wired together yet (the keywords
don't drive the device); the KWS tab was built first to prove viability.

## Running

```sh
npm install
npm run dev      # Next dev server on http://localhost:8931
```

Also: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run format`.

Everything is local/offline except the Autoblow cloud API. The ~40MB
recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is fetched by
the page on load and cached by the browser.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the app is put together: the
  engine/hook/panel split, the shared device layer, the algorithm runner, and
  the Vacuglide HTTP API.
- [VACUGLIDE-AUTOPILOT.md](./VACUGLIDE-AUTOPILOT.md) — the reverse-engineered
  autopilot algorithm (mystery script, intensity, edge control, suction).
- [HOMEGROWN-AUTOPILOT.md](./HOMEGROWN-AUTOPILOT.md) — the home-grown algorithm.
