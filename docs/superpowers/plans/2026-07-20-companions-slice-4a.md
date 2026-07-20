# Companions Slice 4a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire slices 1–3 into a working Companions session — the device runs Elise's program while she talks — and move the LLM backend from local Ollama to OpenRouter.

**Architecture:** The `CompanionsPanel` becomes a device-arming panel (like Autopilot) *and* keeps its `useVoiceSession` mic loop: it arms the one Player with a `CompanionEngine`, gains a `Home › Companions › Play` sub-level with a minimal one-companion picker, and exposes temporary program-shape knobs. The LLM proxy route is repointed at OpenRouter with a server-side `Authorization: Bearer` key; the persona leaves the (deleted) Ollama model card and becomes a client-side system message carried on the `Companion` config.

**Tech Stack:** Next.js (App Router, RSC), TypeScript, React, Tailwind, the `openai` SDK (OpenAI-compatible → OpenRouter), Jest (`@jest/globals`, node env), Playwright (e2e).

## Global Constraints

- **Zero-warning repo.** `npm run lint` runs `--max-warnings 0`; fix every lint/typecheck warning before finishing a task, including ones you didn't cause.
- **Gate on clean `npm run typecheck` AND `npm run lint`** (no output) before each commit; run `npm run build` (it runs `tsc`, catching RSC issues the dev server tolerates) for tasks touching the panel/page.
- **No secret in any committed file.** The repo is public. The OpenRouter key lives **only** in `.env.local` (gitignored via `.env.*`). Never put it in `.env.example`, the plan, the spec, the changelog, code, or a commit message.
- **No Co-Authored-By lines in commits.**
- **Engines don't import each other.** `CompanionEngine` is already self-contained; don't refactor it into shared modules.
- **Commit style:** newest-first CHANGELOG entries; commit-style bold summaries. Update `CHANGELOG.md` as part of the work when a user-notable change lands (see Task 5).
- **Already on the `companions` branch** — do not branch again; do not commit to `main`.
- **Companions registers NO vosk algorithm words this slice.** Every device control is an on-screen button; vosk carries only the existing global words. Do not call `useVoiceCommands` in the panel, and do not wire `useStrokeControls`'s `keywords` to voice.

---

### Task 1: Repoint the LLM proxy route at OpenRouter

**Files:**
- Modify: `src/app/api/llm/chat/completions/route.ts`
- Test: `src/app/api/llm/chat/completions/route.test.ts`

**Interfaces:**
- Consumes: env `LLM_URL`, `OPENROUTER_API_KEY`.
- Produces: a `POST(request: Request): Promise<Response>` that forwards to `${LLM_URL}/chat/completions` with an `Authorization: Bearer` header, **without** overriding `body.model` (the client now chooses the model per-companion).

- [ ] **Step 1: Update the route test to the OpenRouter contract**

Replace the body of `src/app/api/llm/chat/completions/route.test.ts` with:

```ts
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";

function sseBody(): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const lines = [
    'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
    "data: [DONE]\n\n",
  ];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l));
      controller.close();
    },
  });
}

function req(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/llm/chat/completions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    signal,
  });
}

describe("POST /api/llm/chat/completions", () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    process.env.LLM_URL = "https://openrouter.test/api/v1";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("forwards to LLM_URL with a bearer key, preserves the client's model, streams the body back", async () => {
    fetchMock.mockResolvedValue(
      new Response(sseBody(), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const { POST } = await import("./route");
    const res = await POST(
      req({
        model: "minimax/minimax-m2:nitro",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const [urlArg, initArg] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(urlArg).toBe("https://openrouter.test/api/v1/chat/completions");
    const headers = initArg.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-or-test");
    const sent = JSON.parse(initArg.body as string) as {
      model: string;
      messages: unknown;
      stream: boolean;
    };
    expect(sent.model).toBe("minimax/minimax-m2:nitro"); // NOT overridden
    expect(sent.stream).toBe(true);
    expect(sent.messages).toEqual([{ role: "user", content: "hi" }]);

    const text = await res.text();
    expect(text).toContain('"content":"Hi"');
    expect(text).toContain("[DONE]");
  });

  it("forwards the request abort signal to the upstream fetch", async () => {
    fetchMock.mockResolvedValue(new Response(sseBody(), { status: 200 }));
    const controller = new AbortController();
    const { POST } = await import("./route");
    await POST(req({ messages: [], stream: true }, controller.signal));
    const initArg = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(initArg.signal).toBeInstanceOf(AbortSignal);
  });

  it("503s when LLM_URL or OPENROUTER_API_KEY is unset", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { POST } = await import("./route");
    const res = await POST(req({ messages: [], stream: true }));
    expect(res.status).toBe(503);
  });

  it("502s when the upstream is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const { POST } = await import("./route");
    const res = await POST(req({ messages: [], stream: true }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- route.test.ts`
Expected: FAIL — the current route reads `LLM_MODEL`, overrides `body.model`, and sends no `authorization` header, so the model-preservation and header assertions fail.

- [ ] **Step 3: Rewrite the route for OpenRouter**

Replace `src/app/api/llm/chat/completions/route.ts` with:

```ts
// Proxy for the companion's LLM. The browser's openai SDK POSTs here (same-origin,
// so no CORS juggling); we inject the OpenRouter API key server-side (it never
// reaches the browser bundle) and stream OpenRouter's SSE response straight back.
// The MODEL is chosen per-companion by the client and is NOT overridden here — a
// multi-companion picker with differing models needs the client to name the model
// (model slugs aren't secret; only the key is). Abortable: the request's signal is
// forwarded upstream, so a client abort (barge-in / Stop) tears down generation.
// Intentionally unauthenticated for the local experiment — see the design's
// "Pre-deployment hardening" note (doubly relevant now it fronts a paid key).
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const url = process.env.LLM_URL;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!url || !apiKey) {
    return Response.json(
      { error: "LLM_URL and OPENROUTER_API_KEY not set" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as Record<string, unknown>;

  let upstream: Response;
  try {
    upstream = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        // OpenRouter attribution (optional; shows up on their dashboard).
        "HTTP-Referer": "http://localhost:8931",
        "X-Title": "Vacuglide Companions",
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
  } catch {
    return Response.json({ error: "LLM upstream unreachable" }, { status: 502 });
  }

  if (!upstream.ok || upstream.body === null) {
    return Response.json({ error: "LLM upstream error" }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream" },
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Gate and commit**

Run: `npm run typecheck && npm run lint`
Expected: no output.

```bash
git add src/app/api/llm/chat/completions/route.ts src/app/api/llm/chat/completions/route.test.ts
git commit -m "Companions: point the LLM proxy at OpenRouter (bearer key, client-chosen model)"
```

---

### Task 2: Persona to code + per-companion model/context + env & docs

**Files:**
- Create: `src/lib/companions/elise-prompt.ts`
- Modify: `src/lib/companions/companions.ts`
- Modify: `src/lib/llm/client.ts`
- Modify: `src/hooks/use-voice-session.ts`
- Modify: `.env.example`
- Create: `.env.local` (gitignored — do NOT commit)
- Delete: `elise.Modelfile`
- Rewrite: `COMPANIONS.md`
- Modify: `docs/superpowers/specs/2026-07-18-companions-design.md` (LLM/Secrets note + 4a bullet)

**Interfaces:**
- Consumes: nothing from earlier tasks (Task 1's route is exercised at runtime, not imported).
- Produces:
  - `Companion` type with `systemPrompt: string`, `model: string`, `contextWindow: number`.
  - `ELISE: Companion` populated with the OpenRouter model + persona.
  - `createLlmClient(model: string): LlmClient` — the model is now a required arg.

- [ ] **Step 1: Capture Elise's persona, then create the prompt module**

Copy the **exact text between the triple quotes** of the `SYSTEM """…"""` directive in `elise.Modelfile` (do this before Step 8 deletes that file). Create `src/lib/companions/elise-prompt.ts`:

```ts
// Elise's persona — the LLM system message that makes her sound like herself.
// Lifted verbatim from the old elise.Modelfile SYSTEM block when the persona
// moved out of the Ollama model card and into the app (Companions Slice 4a).
// Kept in its own module so companions.ts stays readable.
export const ELISE_SYSTEM_PROMPT = `<paste the exact SYSTEM block text from elise.Modelfile here>`;
```

Use a backtick template literal; if the persona text contains a backtick or `${`, escape it (`` \` ``, `\${`). Otherwise reproduce it character-for-character.

- [ ] **Step 2: Extend the Companion type and Elise's config**

Replace `src/lib/companions/companions.ts` with:

```ts
import { ELISE_SYSTEM_PROMPT } from "./elise-prompt";

export type Companion = {
  name: string;
  gender: "female" | "male" | "nonbinary"; // display-only, shown on the picker
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message (no model card)
  model: string; // OpenRouter model slug the client requests for this companion
  contextWindow: number; // model context window (tokens); recorded for 4b pruning
  // generationBias / initiative / agency arrive in later slices.
};

export const ELISE: Companion = {
  name: "Elise",
  gender: "female",
  // voiceId: "exHJXWRRhHzWYCoZrSF1", // sexy
  voiceId: "uhseMNDjn3oAF24Hh83b", // normal
  systemPrompt: ELISE_SYSTEM_PROMPT,
  model: "minimax/minimax-m2:nitro",
  // MiniMax M2 is 204,800 nominal, but :nitro may route to a ~196,608 provider;
  // record the conservative value so 4b's pruning is safe whichever serves it.
  contextWindow: 196608,
};
```

- [ ] **Step 3: Make `createLlmClient` take the model**

In `src/lib/llm/client.ts`: delete the `PLACEHOLDER_MODEL` constant and its comment, change the factory signature, and send the passed model. Apply these edits:

Replace:
```ts
// Overridden server-side by LLM_MODEL — a placeholder only to satisfy the SDK.
const PLACEHOLDER_MODEL = "companion";

export function createLlmClient(): LlmClient {
```
with:
```ts
export function createLlmClient(model: string): LlmClient {
```

Replace:
```ts
    const completion = await client.chat.completions.create(
      { model: PLACEHOLDER_MODEL, messages, stream: true },
      { signal: opts.signal },
    );
```
with:
```ts
    const completion = await client.chat.completions.create(
      { model, messages, stream: true },
      { signal: opts.signal },
    );
```

Also update the top-of-file comment: the model is no longer injected server-side — the client sends the companion's model; only the API key is server-side. Change the first comment paragraph's "the route overrides the model, and the proxy is unauthenticated" to note the client now sends the model and the route injects only the key.

- [ ] **Step 4: Feed Elise's model + persona through the session**

In `src/hooks/use-voice-session.ts`:

Change `ensureClients` to pass the model:
```ts
    llmRef.current ??= createLlmClient(ELISE.model);
```

In `submitText`, prepend the system message to every turn — replace:
```ts
          for await (const delta of llm.stream(
            [{ role: "user", content: prompt }],
            { signal: controller.signal },
          )) {
```
with:
```ts
          for await (const delta of llm.stream(
            [
              { role: "system", content: ELISE.systemPrompt },
              { role: "user", content: prompt },
            ],
            { signal: controller.signal },
          )) {
```

(`ELISE` is already imported in this file.)

- [ ] **Step 5: Update `.env.example` (secret-free)**

Replace the `LLM_URL` / `LLM_MODEL` block in `.env.example` with:

```
# The OpenAI-compatible chat endpoint the app talks to. We use OpenRouter, which
# is OpenAI-compatible; the app's LLMClient targets that shape. Each companion
# picks its own model (see src/lib/companions), so there is no LLM_MODEL here.
LLM_URL=https://openrouter.ai/api/v1

# OpenRouter API key — read server-side only (the /api/llm proxy route adds it as
# a Bearer header). NEVER commit a real key; it belongs only in .env.local.
OPENROUTER_API_KEY=
```

Leave the `ELEVENLABS_API_KEY` block and the file's header comments unchanged.

- [ ] **Step 6: Create `.env.local` with the real values (do NOT commit)**

Create `.env.local` (already matched by `.env.*` in `.gitignore`) containing:
- `LLM_URL=https://openrouter.ai/api/v1`
- `OPENROUTER_API_KEY=` set to the `sk-or-…` key the user provided in the session.
- Carry over any existing `ELEVENLABS_API_KEY` value if one was already set.

Verify it is ignored:

Run: `git check-ignore .env.local`
Expected: prints `.env.local` (i.e. it is ignored). If it prints nothing, STOP — do not proceed; the key must never be staged.

- [ ] **Step 7: Rewrite `COMPANIONS.md` for OpenRouter**

Replace `COMPANIONS.md` so it describes the OpenRouter model instead of Ollama cards. It should cover:
- Each companion is a config object (`src/lib/companions`) carrying its own OpenRouter `model` slug, `contextWindow`, `voiceId`, and `systemPrompt` (the persona — now in code, e.g. `elise-prompt.ts`, not a model card).
- The app talks to OpenRouter's OpenAI-compatible endpoint via the same-origin `/api/llm` proxy, which injects `OPENROUTER_API_KEY` server-side.
- Configuration: `LLM_URL` (`https://openrouter.ai/api/v1`) and `OPENROUTER_API_KEY` in `.env.local`; no `LLM_MODEL` (per-companion).
- Adding a companion: add a `Companion` entry with its model/context/voice/persona; put a long persona in its own `*-prompt.ts` module.
- Note that explicit-content suitability depends on the chosen OpenRouter model (why a permissive model is used).

Remove all Ollama/Modelfile/Cydonia card mechanics.

- [ ] **Step 8: Delete the Modelfile and note the backend switch in the shared design doc**

```bash
git rm elise.Modelfile
```

In `docs/superpowers/specs/2026-07-18-companions-design.md`:
- At the top of the **### LLM** subsection, add a one-line note: as of Slice 4a the backend is **OpenRouter** (OpenAI-compatible), not self-hosted Ollama; the persona lives in the `Companion` config as a client-side system message, and each companion carries its own `model` + `contextWindow`. (Leave the historical rationale prose; this is a pointer.)
- In the **4a** bullet of the "Build order" section, add a parenthetical that 4a as built ships one companion (Elise) with a random program and temporary on-screen knobs, and folds in the Ollama→OpenRouter swap; the two-persona / `generationBias` mapping is deferred to when companion #2 lands.

- [ ] **Step 9: Gate and commit (persona/config/env/docs)**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean, build succeeds.

```bash
git add src/lib/companions/elise-prompt.ts src/lib/companions/companions.ts \
  src/lib/llm/client.ts src/hooks/use-voice-session.ts .env.example \
  COMPANIONS.md docs/superpowers/specs/2026-07-18-companions-design.md
git status   # confirm .env.local is NOT listed
git commit -m "Companions: move persona into config + per-companion model/context; drop the Ollama Modelfile"
```

> After this task, manually verify the LLM path end-to-end (needs `.env.local`): `npm run dev`, open Companions, type a message, press **Send** — Elise should reply as herself over OpenRouter. (Full session verification is Task 5.)

---

### Task 3: Companions nav sub-level + panel arms the Player

**Files:**
- Modify: `src/app/page.tsx:407-409` (the Companions render block)
- Modify: `src/components/algorithms/companions-panel.tsx`

**Interfaces:**
- Consumes: `ELISE` (config), `useVoiceSession`, `CompanionEngine`, the shared `PlayerView` (`player`) and `VacuglideDeviceController` (`vacuglide`), `SessionControls`, `Sparkline`, `Card`, `Button`.
- Produces: `CompanionsPanel({ vacuglide, player, active, view, onEnterPlay })` — a device-arming panel with a setup view (Elise picker + Begin) and a play view (device transport + sparkline + the existing conversation UI).

- [ ] **Step 1: Pass the device + nav props from the page**

In `src/app/page.tsx`, replace the Companions render block:

```tsx
          <div className={screen === "companions" ? undefined : "hidden"}>
            <CompanionsPanel active={screen === "companions"} />
          </div>
```
with:
```tsx
          <div className={screenBase === "companions" ? undefined : "hidden"}>
            <CompanionsPanel
              vacuglide={vacuglide}
              player={player}
              active={screenBase === "companions"}
              view={atPlayLevel ? "play" : "setup"}
              onEnterPlay={() => navigate("companions/play")}
            />
          </div>
```

(`screenBase`, `atPlayLevel`, `navigate`, `vacuglide`, `player` are all already in scope in `App`. The breadcrumb, nav-lock, and `/play` popstate handling are already generic over any algorithm, so no other page change is needed.)

- [ ] **Step 2: Rewrite the panel — device arming + setup/play views**

Replace `src/components/algorithms/companions-panel.tsx` with the following. It keeps the single `useVoiceSession` call and the memoized hot-path pieces, adds the `CompanionEngine` + Player transport, and splits setup/play. The hidden `<audio>` is rendered once, outside the view branch, so its ref stays stable across the switch. (Knob cards + stroke are added in Task 4.)

```tsx
"use client";

// Companions panel. Two jobs in one panel: (1) the voice session — the mic/STT/
// LLM/TTS loop via useVoiceSession, hosting the <audio> the TTS plays through;
// (2) a device-arming panel — it owns a CompanionEngine and arms/plays the one
// shared Player, so the device runs Elise's program while she talks. Slice 4a:
// one companion, a random program on fixed default knobs, temporary on-screen
// knobs (they become LLM-driven tools later), and buttons-only device controls
// (no vosk words — open dictation to Elise would otherwise transcribe them).
//
// Hot-path note: useVoiceSession returns one `status` object that churns ~50x/s
// while the mic is on; keep the render cheap. The event log is split into a
// memoized child so the rms churn doesn't reconcile it, and the fast loudness
// bar is isolated in <RmsMeter>.

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { SessionControls } from "@/components/session-controls";
import { Sparkline } from "@/components/sparkline";
import type { PlayerView } from "@/hooks/use-player";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { ELISE } from "@/lib/companions/companions";
import {
  CompanionEngine,
  type IntensityLevel,
  type EdgeControlLevel,
  type SuctionControlLevel,
} from "@/lib/algorithms/companion-engine";

// Fixed default knobs for 4a — the program is random within this baseline
// (generationBias -> knobs is deferred to when companion #2 lands).
const DEFAULT_INTENSITY: IntensityLevel = "medium";
const DEFAULT_EDGE: EdgeControlLevel = "moderate";
const DEFAULT_SUCTION: SuctionControlLevel = "little";

// The session's fast-moving loudness bar — repaints every frame; kept small.
function RmsMeter({ rms, speaking }: { rms: number; speaking: boolean }) {
  const pct = Math.min(100, Math.round(rms * 500));
  return (
    <div className="bg-foreground/10 h-2 w-full overflow-hidden rounded">
      <div
        className={`h-full ${speaking ? "bg-emerald-500" : "bg-foreground/30"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type LogEntry = { id: number; text: string };

const EventLog = memo(function EventLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">No events yet.</p>;
  }
  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
      {entries.map((e) => (
        <li key={e.id} className="text-muted-foreground">
          {e.text}
        </li>
      ))}
    </ul>
  );
});

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

export function CompanionsPanel({
  vacuglide,
  player,
  active,
  view,
  onEnterPlay,
}: {
  vacuglide: VacuglideDeviceController;
  player: PlayerView;
  active: boolean;
  view: "setup" | "play";
  onEnterPlay: () => void;
}) {
  const device = vacuglide.player;
  const {
    start: startListening,
    stop: stopListening,
    submitText,
    cancelReply,
    status,
    audioRef,
  } = useVoiceSession();

  // The device engine — one instance, owned here.
  const engineRef = useRef<CompanionEngine | null>(null);
  engineRef.current ??= new CompanionEngine(
    DEFAULT_INTENSITY,
    DEFAULT_EDGE,
    DEFAULT_SUCTION,
  );
  const engine = engineRef.current;

  const isCurrent = player.source === engine;
  const state = isCurrent ? player.state : "armed";

  // Arm the engine when the play view is up and the Player is free — mirrors
  // Autopilot, but gated to the play level (setup doesn't touch the device).
  useEffect(() => {
    if (
      active &&
      view === "play" &&
      player.state === "armed" &&
      player.source !== engine
    ) {
      device.arm(engine);
    }
  }, [active, view, player.state, player.source, device, engine]);

  // A hot mic must not linger once you leave Companions. stop() is idempotent.
  useEffect(() => {
    if (!active) stopListening();
  }, [active, stopListening]);

  // Device transport (the program) — distinct from the mic's start/stop.
  const startProgram = useCallback(() => {
    if (device.source !== engine) device.arm(engine);
    device.play();
  }, [device, engine]);
  const stopProgram = useCallback(() => {
    void device.pause();
  }, [device]);
  const reset = useCallback(() => {
    engine.setIntensity(DEFAULT_INTENSITY);
    engine.setEdgeControl(DEFAULT_EDGE);
    engine.setSuctionControl(DEFAULT_SUCTION);
    device.arm(engine);
  }, [device, engine]);

  const enterPlay = useCallback(() => {
    device.arm(engine);
    onEnterPlay();
  }, [device, engine, onEnterPlay]);

  // Transition log for the acceptance run.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const append = useCallback((text: string) => {
    setLog((l) => [{ id: logIdRef.current++, text }, ...l].slice(0, 30));
  }, []);

  const prevPhase = useRef(status.phase);
  useEffect(() => {
    if (status.phase !== prevPhase.current) {
      prevPhase.current = status.phase;
      append(`STT ${status.phase}`);
    }
  }, [status.phase, append]);

  const prevCommitted = useRef(status.committed);
  useEffect(() => {
    if (status.committed !== prevCommitted.current) {
      prevCommitted.current = status.committed;
      if (status.committed !== "") append(`heard: "${status.committed}"`);
    }
  }, [status.committed, append]);

  const prevReply = useRef(status.replyPlaying);
  useEffect(() => {
    if (status.replyPlaying !== prevReply.current) {
      prevReply.current = status.replyPlaying;
      append(status.replyPlaying ? "reply started" : "reply ended");
    }
  }, [status.replyPlaying, append]);

  const [text, setText] = useState("");
  const prevCommittedForBox = useRef(status.committed);
  useEffect(() => {
    if (status.committed !== prevCommittedForBox.current) {
      prevCommittedForBox.current = status.committed;
      if (status.committed !== "") setText(status.committed);
    }
  }, [status.committed]);

  const connected = vacuglide.connected;

  return (
    <section className="flex w-full flex-col gap-8">
      {/* TTS element — rendered once, in both views, so audioRef stays stable. */}
      <audio ref={audioRef} className="hidden" />

      {view === "setup" ? (
        <Card title="Companions">
          <p className="text-muted-foreground text-sm">
            Choose a companion. She listens, replies in her own voice, and runs
            the device while you talk — cut in any time and she stops.
          </p>
          <div className="border-emerald-500 bg-linear-to-br mt-2 rounded-lg border from-emerald-500/15 to-emerald-500/5 p-4">
            <p className="font-medium">{ELISE.name}</p>
            <p className="text-muted-foreground text-sm">
              A high-energy, flirty streamer with a dry, quieter side.
            </p>
          </div>
          {/* No badge — Companions registers no vosk words this slice. */}
          <Button
            onClick={enterPlay}
            className="mt-4 w-full rounded-lg bg-blue-600 py-3.5 text-lg font-bold text-white"
          >
            Begin
          </Button>
        </Card>
      ) : (
        <>
          <SessionControls
            state={state}
            connected={connected}
            onStart={startProgram}
            onStop={stopProgram}
            onReset={reset}
          />

          <Card>
            <Sparkline
              points={player.upcoming.speed}
              valves={player.upcoming.valves}
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>now</span>
              <span>+60s</span>
            </div>
          </Card>

          <Card title="Microphone">
            <Button
              onClick={() => (status.micOn ? stopListening() : startListening())}
              className={`w-full rounded-lg px-4 py-3 text-sm font-medium ${
                status.micOn
                  ? "bg-foreground/10 hover:bg-foreground/20"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {status.micOn ? "Stop listening" : "Start listening"}
            </Button>
            <div className="mt-2">
              <Row label="Mic">{status.micOn ? "on" : "off"}</Row>
              <Row label="State">
                <span
                  className={status.vadSpeaking ? "text-emerald-500" : undefined}
                >
                  {status.vadSpeaking ? "speaking" : "quiet"}
                </span>
              </Row>
              <RmsMeter rms={status.rms} speaking={status.vadSpeaking} />
            </div>
          </Card>

          <Card title="Conversation">
            <p className="text-muted-foreground text-sm">
              Speak (hands-free) or type. <strong>Send</strong> runs the model
              only; <strong>Say it</strong> speaks the reply. Stop — or just talk
              over her — to cut it.
            </p>
            <div className="text-muted-foreground mt-2 flex gap-4 text-xs">
              <span>STT {status.phase}</span>
              <span>pre-roll {status.preRollFrames}</span>
            </div>
            <p className="min-h-6 text-sm">
              {status.committed !== "" && <span>{status.committed} </span>}
              {status.partial !== "" && (
                <span className="text-muted-foreground">{status.partial}</span>
              )}
              {status.committed === "" && status.partial === "" && (
                <span className="text-muted-foreground">Nothing heard yet.</span>
              )}
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message, or speak…"
              className="bg-foreground/5 mt-2 min-h-16 w-full rounded-lg p-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <Button
                onClick={() => submitText(text, { speak: false })}
                disabled={text.trim() === "" || status.replyPlaying}
                className="bg-foreground/10 hover:bg-foreground/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Send
              </Button>
              <Button
                onClick={() => submitText(text, { speak: true })}
                disabled={text.trim() === "" || status.replyPlaying}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Say it
              </Button>
              <Button
                onClick={cancelReply}
                disabled={!status.replyPlaying}
                className="bg-foreground/10 hover:bg-foreground/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Stop
              </Button>
              <span className="text-muted-foreground self-center text-sm">
                {status.replyPlaying ? "working…" : "idle"}
              </span>
            </div>
            {status.replyError !== null && (
              <p className="mt-2 text-sm text-red-500">
                Error: {status.replyError}
              </p>
            )}
            <div className="mt-2 text-sm">
              <p className="text-muted-foreground mb-1">Response</p>
              <p className="min-h-6 whitespace-pre-wrap">
                {status.replyText === "" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  status.replyText
                )}
              </p>
            </div>
          </Card>

          <Card title="Events">
            <EventLog entries={log} />
          </Card>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Gate and build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Manually verify the nav + device track**

Run `npm run dev`. Home → say/click **Companions** → the setup view shows Elise + **Begin** → click Begin → URL becomes `#companions/play`, breadcrumb reads `Home › Companions › Play`. Press **Start**: `player.state` goes to `playing`, the sparkline advances, and (if a device is connected) the hardware moves. Confirm the breadcrumb's Home/back is disabled while playing. Press **Stop**. Confirm **Start listening** still opens the mic and Elise replies.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/algorithms/companions-panel.tsx
git commit -m "Companions: arm the Player with CompanionEngine + add the Play sub-level"
```

---

### Task 4: Temporary device controls — stroke + program-shape knobs

**Files:**
- Modify: `src/components/algorithms/companions-panel.tsx`

**Interfaces:**
- Consumes: `useStrokeControls`, `StrokeCard`, `Segmented`, `CompanionEngine`'s `setIntensity`/`setEdgeControl`/`setSuctionControl`, `device.invalidateFuture`/`device.invalidateValves`.
- Produces: no new exports — extends the panel's play view with a stroke card and three knob cards.

- [ ] **Step 1: Add stroke + knob state, imports, and handlers**

In `src/components/algorithms/companions-panel.tsx`, add these imports alongside the existing ones:

```tsx
import { Segmented } from "@/components/segmented";
import { StrokeCard } from "@/components/stroke-card";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
```

Inside `CompanionsPanel`, after `const engine = engineRef.current;`, add the knob state (initialised to the fixed defaults):

```tsx
  const [intensity, setIntensity] = useState<IntensityLevel>(DEFAULT_INTENSITY);
  const [edge, setEdge] = useState<EdgeControlLevel>(DEFAULT_EDGE);
  const [suction, setSuction] = useState<SuctionControlLevel>(DEFAULT_SUCTION);
  // Manual stroke state only — its `keywords` are intentionally NOT wired to
  // voice (Companions registers no vosk words this slice).
  const stroke = useStrokeControls(vacuglide, player);
```

Update `reset` to also restore the React knob state (it already resets the engine):

```tsx
  const reset = useCallback(() => {
    setIntensity(DEFAULT_INTENSITY);
    engine.setIntensity(DEFAULT_INTENSITY);
    setEdge(DEFAULT_EDGE);
    engine.setEdgeControl(DEFAULT_EDGE);
    setSuction(DEFAULT_SUCTION);
    engine.setSuctionControl(DEFAULT_SUCTION);
    device.arm(engine);
  }, [device, engine]);
```

Add the knob handlers (place them after `enterPlay`), mirroring Autopilot — intensity/edge reshape the script (`invalidateFuture`), suction is a valve-only overlay (`invalidateValves`):

```tsx
  const changeIntensity = useCallback(
    (level: IntensityLevel) => {
      setIntensity(level);
      engine.setIntensity(level);
      device.invalidateFuture();
      vacuglide.log(`intensity → ${level}`);
    },
    [device, engine, vacuglide],
  );
  const changeEdge = useCallback(
    (level: EdgeControlLevel) => {
      setEdge(level);
      engine.setEdgeControl(level);
      device.invalidateFuture();
      vacuglide.log(`edge control → ${level}`);
    },
    [device, engine, vacuglide],
  );
  const changeSuction = useCallback(
    (level: SuctionControlLevel) => {
      setSuction(level);
      engine.setSuctionControl(level);
      device.invalidateValves();
      vacuglide.log(`vacuum maintenance → ${level}`);
    },
    [device, engine, vacuglide],
  );

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );
```

- [ ] **Step 2: Add the cards to the play view**

In the play-view `<>…</>`, insert the stroke and knob cards after the `Sparkline` `Card` and before the `Microphone` `Card`. Wrap the knobs in a note that they are transitional:

```tsx
          <StrokeCard
            strokeDisabled={!stroke.canStroke}
            strokePulsing={stroke.strokePulsing}
            onValvePlus={vacuglide.valvePlus}
            onValveMinus={vacuglide.valveMinus}
            onError={logError}
          />

          {/* Temporary bring-up knobs — Elise will turn these herself via LLM
              tools in a later slice, at which point they come off the screen. */}
          <Card title="Intensity">
            <Segmented
              options={[
                { value: "warmup", label: "Warmup" },
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
              value={intensity}
              onChange={changeIntensity}
              activeClass="bg-blue-600 text-white"
            />
          </Card>

          <Card title="Edge Control">
            <Segmented
              options={[
                { value: "gentle", label: "Gentle" },
                { value: "moderate", label: "Moderate" },
                { value: "intense", label: "Intense" },
              ]}
              value={edge}
              onChange={changeEdge}
              activeClass="bg-orange-500 text-white"
            />
          </Card>

          <Card title="Vacuum Maintenance">
            <Segmented
              options={[
                { value: "off", label: "Off" },
                { value: "little", label: "Light" },
                { value: "more", label: "Heavy" },
              ]}
              value={suction}
              onChange={changeSuction}
              activeClass="bg-cyan-600 text-white"
            />
          </Card>
```

(No `badge` props on the `Segmented` options — badges advertise a voice word, and these have none this slice.)

- [ ] **Step 3: Gate and build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Manually verify the knobs**

`npm run dev` → Companions → Begin → Start. Change **Intensity** and **Edge Control**: the sparkline's upcoming shape regenerates. Change **Vacuum Maintenance**: the valve overlay re-lays without disturbing the speed line. The stroke ± buttons pulse when connected.

- [ ] **Step 5: Commit**

```bash
git add src/components/algorithms/companions-panel.tsx
git commit -m "Companions: temporary on-screen program knobs + manual stroke controls"
```

---

### Task 5: Full-session verification + changelog

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a CHANGELOG entry; no code.

- [ ] **Step 1: Drive the whole slice end-to-end**

With `.env.local` populated and `npm run dev` running:
1. Home → Companions → setup view shows Elise → **Begin** → `Home › Companions › Play`.
2. **Start** the program → device runs (sparkline advances / hardware moves if connected); breadcrumb locked while playing.
3. **Start listening** → speak → your words are transcribed → Elise replies in her own voice **over OpenRouter** (check the network tab hits `/api/llm/...` and streams).
4. **Barge in** (talk over her) → she stops mid-sentence.
5. Adjust **Intensity / Edge / Vacuum Maintenance** → the upcoming program changes accordingly.
6. Say the **safe word** while playing → the device stops (the voice session staying up is expected; teardown is 4d).
7. **Stop**, then confirm you can now leave via the breadcrumb.

- [ ] **Step 2: Add the changelog entry**

In `CHANGELOG.md`, under today's date (`## 2026-07-20`, create the heading if absent, newest date first), add entries in feature→enhancement→bug→internal order. Use:

```
- feature: **Companions runs the device** — pick Elise, enter Play, and the device runs her program while she talks; tune the program with on-screen Intensity, Edge and Vacuum controls. ([#N](https://github.com/autogoon/autogoon/pull/N))
- internal: **Companions LLM on OpenRouter** — the companion backend moved from local Ollama to OpenRouter (OpenAI-compatible); the persona now lives in the companion config as a system message and each companion carries its own model + context window. ([#N](https://github.com/autogoon/autogoon/pull/N))
```

Replace `#N` with the real PR number once the PR exists (the changelog rule allows the link to be filled when the PR is opened). Do **not** add a `bug` line — nothing that shipped on `main` was fixed.

- [ ] **Step 3: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run format`
Expected: clean; if `format` changes files, include them in the commit.

```bash
git add CHANGELOG.md
git commit -m "Companions: changelog for Slice 4a (device integration + OpenRouter)"
```

---

## Self-Review notes (for the implementer)

- **Secret discipline is the top risk.** `.env.local` is the only home for the key; Step 6 of Task 2 verifies `git check-ignore` before anything is staged, and Task 2 Step 9 checks `git status` shows no `.env.local`. If either check fails, stop.
- **No vosk words in Companions** is deliberate and load-bearing for this slice (avoids the two-mic collision deferred to 4d); the panel never calls `useVoiceCommands`, and stroke `keywords` are unused on purpose.
- **The `<audio>` element is rendered once, outside the view branch**, so TTS survives a setup↔play switch.
- **Knob semantics** match Autopilot exactly: intensity/edge → `invalidateFuture`, suction → `invalidateValves`.
```
