# The Homegrown algorithm

A fresh, home-grown alternative to the [Vacuglide Autopilot](./VACUGLIDE-AUTOPILOT.md).
Unlike the autopilot — which is a faithful reverse-engineering of the original
app — this one is ours to design from scratch.

**Status: boilerplate.** For now the "algorithm" just holds a constant speed of
10. `start()` sends `target-speed 10`; `pause()` sends `target-speed/stop`. The
subscribe/notify scaffolding (`src/lib/homegrown-autopilot-engine.ts`) is in place so the
algorithm can grow without reworking how it plugs into the app.

It follows the same three-layer shape as the autopilot and shares the same
device layer:

- **`src/lib/homegrown-autopilot-engine.ts`** — the `HomegrownAutopilot` engine. It drives the
  device purely through a `getDevice()` accessor it is handed, so it reuses the
  same `useVacuglideDevice` device layer as everything else.
- **`src/hooks/use-homegrown-autopilot.ts`** — the React hook mirroring the engine into
  render state and wiring the `pagehide` safety-stop.
- **`src/components/homegrown-autopilot-panel.tsx`** — the presentation (a Start button
  and the shared command log).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the engine/hook/panel layers,
the shared device, and the algorithm runner fit together.

## Ideas / TODO

The intent is a genuinely different edging algorithm — eventually driven by the
keyword-spotting voice input, which the autopilot has no notion of.
