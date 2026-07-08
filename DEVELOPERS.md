# Developing Autogoon

How to run Autogoon locally and contribute changes. For how the app is put
together internally — the program/player model, the engine/panel split, the
shared device layer and single Player, and the keyword spotter — see
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Running locally

```sh
npm install
npm run dev      # Next dev server on http://localhost:8931 (bound to 0.0.0.0)
```

Other scripts:

- `npm run build` — production build (also runs `tsc`, so it catches RSC/Next
  issues the dev server tolerates).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint --max-warnings 0`.
- `npm run format` — Prettier over `src` and the root config/docs.

The ~40MB recognizer model (`public/vosk-model-small-en-us-0.15.tar.gz`) is
fetched by the page on load and cached by the browser; nothing else is needed
offline.

## Contributing

- **Branch off `main`** — never commit to `main` directly. One branch/PR per piece
  of work.
- **Before committing** — at the latest before the PR is ready to review — run
  `npm run typecheck`, `npm run lint`, and `npm run format`. **Zero warnings:**
  typecheck and lint must pass with no output; fix every warning, not just the
  ones your change introduced. If `format` changes files, commit those changes.
- **No test framework.** The app drives physical hardware, so verify changes by
  running the app and driving the affected flow in the browser — not just
  typecheck and build.
- **Update [CHANGELOG.md](./CHANGELOG.md)** for anything a user would notice (see
  the format note at the top of that file).
- **Adding a movement mode?** It's a new engine
  (`src/lib/algorithms/*-engine.ts`) and panel
  (`src/components/algorithms/*-panel.tsx`), wired in with one `<Panel>` and one
  tab in `src/app/page.tsx`. See the engine/panel pattern in
  [ARCHITECTURE.md](./ARCHITECTURE.md).
