# Developing Autogoon

How to run Autogoon locally and contribute changes. For how the app is put
together internally — the program/player model, the engine/hook/panel split, the
shared device layer and algorithm runner, and the keyword spotter — see
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

- Branch off `main` and open a pull request.
- **Zero warnings.** `npm run lint` and `npm run typecheck` must both pass with no
  output. Fix every warning, not just the ones your change introduced.
- Run `npm run format` before committing.
- **No test framework.** The app drives physical hardware, so verify changes by
  running the app and driving the affected flow in the browser — not just
  typecheck and build.
- **Adding a movement mode?** It's a new engine (`src/lib/*-engine.ts`), hook
  (`src/hooks/use-*.ts`), and panel (`src/components/*-panel.tsx`), registered in
  `src/app/page.tsx`. See the engine/hook/panel pattern in
  [ARCHITECTURE.md](./ARCHITECTURE.md).
