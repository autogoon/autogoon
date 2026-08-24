# Developing Autogoon

Developer guide for local environment setup, testing, and contribution
guidelines. Internal system design is documented in
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Adding a companion

Companions are distributed as [goonpacks](./GOONPACKS.md) rather than committed
application code. Build custom companions as standalone goonpack archives
following the specification in [GOONPACKS.md](./GOONPACKS.md).

Built-in companions in the repository provide a baseline reference set.

## Running locally

### Prerequisites

- [Node.js](https://nodejs.org/) 20.9 or newer
- `git`

### Setup and execution

```sh
npm install
npm run dev      # Next dev server on http://localhost:8931 (bound to 0.0.0.0)
```

Configuration:

- Core playback functions require no external API keys.
- **Companions** and the dev-only **Inference** subsystem require API
  credentials. Copy [`.env.example`](./.env.example) to `.env` and populate
  provider keys. Companions itself reads its keys from the browser, not from
  `.env` — press **Load from .env** under Settings → API keys once, and Save.
- For local network access on `0.0.0.0`, configure `DEV_ALLOWED_ORIGINS` in
  `.env` to prevent cross-origin dev asset blocking.
- Production compilation is verified with `npm run build`.

The keyword recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is
downloaded on initial load and cached in browser storage.

## Making changes

Validation workflow:

1. `npm run typecheck` and `npm run lint` — static analysis gates (zero warnings
   permitted).
2. `npm run format` — code and markdown formatting.
3. `npm test` and `npm run test:e2e` — unit and integration test suites.

Contribution process:

- Open pull requests against `main` using branches on personal forks.
- Update [CHANGELOG.md](./CHANGELOG.md) for notable features, fixes, and
  refactors.
- User-facing features require corresponding documentation in
  [MODES.md](./MODES.md) or `modes/*.md`.
- Adhere to the [Content policy](#content-policy).

## Content policy

Autogoon is a local playback application and does not distribute adult media. In
compliance with the UK Online Safety Act and copyright statutes, the project
does not host, bundle, or index adult content, nor recommend third-party content
sources. Users import local files into browser storage.

The repository includes a single media-free reference pack
([`goonpacks/elise/`](./goonpacks/elise/)).

Pull requests must not include:

- bundled, hosted, or remotely downloaded media assets;
- catalog indexes, curated directory links, or third-party gallery features;
- documentation directing users to third-party media sources.

## Testing

Testing is local-only:

- **Unit tests** — `npm test` (Jest via `next/jest`). Tests are colocated with
  source modules (`jest.config.mjs`). Node is the default environment.
  DOM-dependent tests specify `@jest-environment jsdom` in file docblocks.
- **End-to-end tests** — `npm run test:e2e` (Playwright in `tests/e2e/`). Specs
  execute against Chromium, Firefox, and WebKit on `http://localhost:8931`.

### E2E voice test architecture

The voice test suite (`tests/e2e/voice-tab-switch.spec.ts`) validates the voice
pipeline across browser engines:

- AudioWorklet audio capture;
- Vosk WASM speech recognition;
- Dynamic grammar and command dispatch.

Microphone hardware input is stubbed via `MediaDevices.prototype.getUserMedia`
to return a synthetic `MediaStream` playing a committed WAV audio fixture. The
test verifies keyword spotting and subsequent screen navigation.

Required test environment preconditions:

- continuous silence generator on audio stub;
- pre-pipeline user activation click;
- pre-seeded `listenOnLoad` local storage preference.

Audio test fixtures reside in `tests/fixtures/` and regenerate via
`tests/fixtures/generate.sh` (macOS).

## Goonpack sources

Local pack authoring directories reside in `goonpacks/<dir>/media/`. Pack
sources and compiled `.zip` archives are gitignored (except the reference
`elise/` directory).

Pack media directories serve as corpora for the dev-only Inference subsystem
([INFERENCE.md](./INFERENCE.md)).

Image captioning scripts (`scripts/describe-image.ts`,
`scripts/describe-missing.ts`) process static images; video media sidecars are
authored manually.
