# Companions Phase 2 — LLM Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the companion a real, model-generated reply — a same-origin proxy
route to Ollama plus a streaming, abortable `LLMClient`, consumed by a decoupled
LLM lab and by the voice I/O foundation's loop (transcript → LLM → TTS,
replacing the canned reply).

**Architecture:** The browser talks to Ollama only through a Next proxy route
(`/api/llm/chat/completions`) that injects `LLM_MODEL` server-side and streams
the SSE response straight back. A thin `LLMClient` wraps the `openai` SDK
pointed at that same-origin route, exposing `stream(messages, { signal })` that
yields token deltas. The voice loop buffers the whole reply, then speaks it via
the existing TTS path; the turn's single `AbortController` now cancels the LLM
stream and TTS together.

**Tech Stack:** Next.js (App Router, `runtime="nodejs"` routes), React client
hooks, the `openai` npm SDK, Ollama (OpenAI-compatible endpoint), Jest
(`@jest/globals`, node env).

## Global Constraints

- Read the design first:
  `docs/superpowers/specs/2026-07-18-companions-design.md`; this phase's spec:
  `docs/superpowers/specs/2026-07-18-companions-phase-2-llm-client.md`.
- Secrets stay server-side: `LLM_URL` / `LLM_MODEL` read **only** in the route,
  never `NEXT_PUBLIC_`, never in the client bundle.
- Model detail stays server-side: the route **overrides** the client-sent
  `model` with `LLM_MODEL`.
- No persona system prompt, no rolling history, no sentence-streaming into TTS
  this phase (all later phases). Each turn sends only
  `[{ role: "user", content: <text> }]`.
- Tests are colocated `*.test.ts`, node environment, import from
  `@jest/globals`.
- Zero-warning outfit: finish with `npm run typecheck`, `npm run lint`
  (`--max-warnings 0`) and `npm run build` all clean; run `npm run format`
  before finishing.
- Do not commit specs or plans (they stay uncommitted on disk). Commit only
  code/test/changelog changes, and only when asked.

---

### Task 1: Proxy route → Ollama (streaming, abortable, model-injected)

**Files:**

- Create: `src/app/api/llm/chat/completions/route.ts`
- Test: `src/app/api/llm/chat/completions/route.test.ts`

**Interfaces:**

- Consumes: nothing (leaf).
- Produces: `POST /api/llm/chat/completions` — accepts an OpenAI
  chat-completions request body `{ model?, messages, stream, ... }`, overrides
  `model` with `LLM_MODEL`, forwards to `` `${LLM_URL}/chat/completions` `` and
  streams the SSE body back with `content-type: text/event-stream`. 503 when env
  unset; 502 on upstream failure.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/llm/chat/completions/route.test.ts`:

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
    process.env.LLM_URL = "http://ollama.test/v1";
    process.env.LLM_MODEL = "elise";
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("forwards to LLM_URL, overrides the model, and streams the body back", async () => {
    fetchMock.mockResolvedValue(
      new Response(sseBody(), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const { POST } = await import("./route");
    const res = await POST(
      req({
        model: "whatever",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const [urlArg, initArg] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(urlArg).toBe("http://ollama.test/v1/chat/completions");
    const sent = JSON.parse(initArg.body as string) as {
      model: string;
      messages: unknown;
      stream: boolean;
    };
    expect(sent.model).toBe("elise"); // overridden, not "whatever"
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

  it("503s when LLM_URL or LLM_MODEL is unset", async () => {
    delete process.env.LLM_URL;
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

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/api/llm/chat/completions/route.test.ts` Expected: FAIL
— `Cannot find module './route'`.

- [ ] **Step 3: Write the route**

Create `src/app/api/llm/chat/completions/route.ts`:

```ts
// Proxy for the companion's LLM. The browser's openai SDK POSTs here (same-origin,
// so no CORS / OLLAMA_ORIGINS juggling); we inject LLM_MODEL server-side (the host
// and model stay off the client) and stream Ollama's SSE response straight back.
// Abortable: the request's signal is forwarded to the upstream fetch, so a client
// abort (barge-in / Stop) tears down the generation. Intentionally unauthenticated
// for the local experiment — see the design's "Pre-deployment hardening" note.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const url = process.env.LLM_URL;
  const model = process.env.LLM_MODEL;
  if (!url || !model) {
    return Response.json(
      { error: "LLM_URL and LLM_MODEL not set" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as Record<string, unknown>;
  body.model = model; // override — model detail stays server-side

  let upstream: Response;
  try {
    upstream = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    });
  } catch {
    return Response.json(
      { error: "LLM upstream unreachable" },
      { status: 502 },
    );
  }

  if (!upstream.ok || upstream.body === null) {
    return Response.json({ error: "LLM upstream error" }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream" },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/app/api/llm/chat/completions/route.test.ts` Expected: PASS
(4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/llm/chat/completions/route.ts src/app/api/llm/chat/completions/route.test.ts
git commit -m "Companions: LLM proxy route to Ollama (streaming, abortable)"
```

---

### Task 2: `LLMClient` over the openai SDK

**Files:**

- Modify: `package.json` (add the `openai` dependency)
- Create: `src/lib/llm/client.ts`
- Test: `src/lib/llm/client.test.ts`

**Interfaces:**

- Consumes: the `POST /api/llm/chat/completions` route from Task 1 (via the
  SDK's `baseURL`).
- Produces:
  - `type LlmMessage = { role: "system" | "user" | "assistant"; content: string }`
  - `type LlmClient = { stream: (messages: LlmMessage[], opts: { signal: AbortSignal }) => AsyncIterable<string> }`
  - `function createLlmClient(): LlmClient` — yields assistant token deltas;
    abort via `opts.signal`.

- [ ] **Step 1: Install the `openai` dependency**

Run: `npm install openai` Expected: `openai` added to `package.json`
dependencies; `package-lock.json` updated.

- [ ] **Step 2: Write the failing test**

Create `src/lib/llm/client.test.ts`:

```ts
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

type Chunk = { choices: { delta: { content?: string } }[] };
const createMock =
  jest.fn<(...args: unknown[]) => Promise<AsyncIterable<Chunk>>>();

jest.mock("openai", () => ({
  __esModule: true,
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

// A fake of the SDK's streamed response: an async iterable of chat-completion
// chunks. Some chunks carry no delta.content (role-only / finish) and must be
// skipped by the client.
function fakeStream(
  deltas: (string | undefined)[],
): AsyncIterable<{ choices: { delta: { content?: string } }[] }> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const content of deltas) {
        yield {
          choices: [{ delta: content === undefined ? {} : { content } }],
        };
      }
    },
  };
}

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const t of it) out.push(t);
  return out;
}

describe("createLlmClient", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("yields concatenated token deltas and skips empty ones", async () => {
    createMock.mockResolvedValue(fakeStream(["Hi", undefined, " there", "!"]));
    const { createLlmClient } = await import("./client");
    const client = createLlmClient();
    const tokens = await collect(
      client.stream([{ role: "user", content: "hi" }], {
        signal: new AbortController().signal,
      }),
    );
    expect(tokens).toEqual(["Hi", " there", "!"]);
    expect(tokens.join("")).toBe("Hi there!");
  });

  it("requests a stream with the given messages and forwards the signal", async () => {
    createMock.mockResolvedValue(fakeStream(["ok"]));
    const { createLlmClient } = await import("./client");
    const client = createLlmClient();
    const signal = new AbortController().signal;
    await collect(client.stream([{ role: "user", content: "hi" }], { signal }));
    const [params, options] = createMock.mock.calls[0] as [
      { messages: unknown; stream: boolean },
      { signal: AbortSignal },
    ];
    expect(params.stream).toBe(true);
    expect(params.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(options.signal).toBe(signal);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/lib/llm/client.test.ts` Expected: FAIL —
`Cannot find module './client'`.

- [ ] **Step 4: Write the client**

Create `src/lib/llm/client.ts`:

```ts
// The companion's LLM client: a thin wrapper over the openai SDK pointed at our
// same-origin proxy route (Task 1), which forwards to Ollama and injects the real
// model server-side. So the SDK's model/apiKey here are placeholders: the route
// overrides the model, and the proxy is unauthenticated for the local experiment.
// openai-node needs an ABSOLUTE baseURL, so we build one off the current origin —
// the client is only ever constructed in the browser.
import OpenAI from "openai";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmClient = {
  // Streams assistant token deltas for a turn. Abort opts.signal to cancel the
  // whole generation (barge-in / Stop).
  stream: (
    messages: LlmMessage[],
    opts: { signal: AbortSignal },
  ) => AsyncIterable<string>;
};

// Overridden server-side by LLM_MODEL — a placeholder only to satisfy the SDK.
const PLACEHOLDER_MODEL = "companion";

export function createLlmClient(): LlmClient {
  // openai-node needs an ABSOLUTE baseURL. In the browser — the only place this
  // client actually runs — that's the page origin; the fallback just keeps it
  // constructable under the node test env, where the SDK call is mocked.
  const baseURL =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/llm`
      : "http://localhost/api/llm";
  const client = new OpenAI({
    baseURL,
    apiKey: "unused", // proxy is unauthenticated locally; key never leaves as a secret
    dangerouslyAllowBrowser: true, // we intentionally run in the browser, next to the device
  });

  async function* stream(
    messages: LlmMessage[],
    opts: { signal: AbortSignal },
  ): AsyncIterable<string> {
    const completion = await client.chat.completions.create(
      { model: PLACEHOLDER_MODEL, messages, stream: true },
      { signal: opts.signal },
    );
    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  return { stream };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/llm/client.test.ts` Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/llm/client.ts src/lib/llm/client.test.ts
git commit -m "Companions: LLMClient over the openai SDK (streaming, abortable)"
```

---

### Task 3: LLM lab section in the Companions panel (decoupled)

**Files:**

- Modify: `src/components/algorithms/companions-panel.tsx` (add a new `Card`,
  below the existing cards, before the closing `</section>`)

**Interfaces:**

- Consumes: `createLlmClient` / `LlmClient` from Task 2.
- Produces: no exported API — an in-panel diagnostic surface (prompt input,
  Send, streamed output, Stop) using the client directly, with its own
  `AbortController`. Independent of the mic session.

- [ ] **Step 1: Add the LlmLab component and its imports**

At the top of `src/components/algorithms/companions-panel.tsx`, add to the
existing imports:

```tsx
import { createLlmClient } from "@/lib/llm/client";
```

Then add this component just above `export function CompanionsPanel` (it is
self-contained — its own state, its own controller, no dependency on the voice
session):

```tsx
// A decoupled lab for this phase's LLMClient: type a prompt, watch tokens stream in,
// press Stop to abort mid-generation. Not wired to the mic — this is the raw
// client proof. The voice loop uses the same client (see use-voice-session).
function LlmLab() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const clientRef = useRef<ReturnType<typeof createLlmClient> | null>(null);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStreaming(false);
  }, []);

  const send = useCallback(async () => {
    if (prompt.trim() === "") return;
    controllerRef.current?.abort(); // supersede any prior in-flight stream
    const controller = new AbortController();
    controllerRef.current = controller;
    clientRef.current ??= createLlmClient();
    setOutput("");
    setError(null);
    setStreaming(true);
    try {
      for await (const delta of clientRef.current.stream(
        [{ role: "user", content: prompt }],
        { signal: controller.signal },
      )) {
        if (controller.signal.aborted) break;
        setOutput((o) => o + delta);
      }
    } catch (e) {
      // Aborted turns land here too; only surface a real error.
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "LLM request failed");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setStreaming(false);
      }
    }
  }, [prompt]);

  return (
    <Card title="LLM lab">
      <p className="text-muted-foreground text-sm">
        Send a prompt straight to the model and watch it stream. Stop aborts
        mid-generation.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Say something…"
        className="bg-foreground/5 min-h-16 w-full rounded-lg p-2 text-sm"
      />
      <div className="mt-2 flex gap-2">
        <Button
          onClick={() => void send()}
          disabled={streaming}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </Button>
        <Button
          onClick={stop}
          disabled={!streaming}
          className="bg-foreground/10 hover:bg-foreground/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Stop
        </Button>
        <span className="text-muted-foreground self-center text-sm">
          {streaming ? "streaming…" : "idle"}
        </span>
      </div>
      {error !== null && (
        <p className="mt-2 text-sm text-red-500">Error: {error}</p>
      )}
      <p className="mt-2 min-h-6 text-sm whitespace-pre-wrap">
        {output === "" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          output
        )}
      </p>
    </Card>
  );
}
```

- [ ] **Step 2: Render the lab in the panel**

In `CompanionsPanel`'s returned JSX, add `<LlmLab />` just before the closing
`</section>` (after the `Events` card):

```tsx
      <Card title="Events">
        <EventLog entries={log} />
      </Card>

      <LlmLab />
    </section>
```

- [ ] **Step 3: Verify typecheck and lint are clean**

Run: `npm run typecheck && npm run lint` Expected: no output (clean). If
`useState`/`useCallback`/`useRef` are already imported at the top of the file
(they are), no import changes are needed beyond `createLlmClient`.

- [ ] **Step 4: Manual check**

Run `npm run dev`, open http://localhost:8931, go to **Companions**, scroll to
**LLM lab**. With Ollama running and `.env` set:

- Type a prompt, click **Send** → tokens stream into the output area.
- While streaming, click **Stop** → output stops growing within a beat.
- Stop Ollama (or leave `LLM_URL` wrong) → Send shows an `Error:` line, panel
  stays usable.

- [ ] **Step 5: Commit**

```bash
git add src/components/algorithms/companions-panel.tsx
git commit -m "Companions: LLM lab panel section (streaming + abort)"
```

---

### Task 4: Wire transcript → LLM → TTS into the voice loop

**Files:**

- Modify: `src/hooks/use-voice-session.ts`
- Modify: `src/lib/companions/companions.ts` (remove the now-unused
  `CANNED_REPLY`)
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: `createLlmClient` / `LlmClient` (Task 2); the existing
  `TtsPlayer.play` and the turn `AbortController`.
- Produces: no new exported API — the committed transcript now drives an LLM
  turn whose full reply is spoken via TTS; the turn's single `AbortController`
  cancels both.

- [ ] **Step 1: Import the client and add a ref**

In `src/hooks/use-voice-session.ts`, update the imports — drop `CANNED_REPLY`,
add the client:

```ts
import { ELISE } from "@/lib/companions/companions";
import { createLlmClient, type LlmClient } from "@/lib/llm/client";
```

Add an LLM client ref alongside the other refs (near `ttsRef`):

```ts
const llmRef = useRef<LlmClient | null>(null);
```

- [ ] **Step 2: Replace `startReply` with the LLM-driven version**

Replace the whole `startReply` callback (currently the `CANNED_REPLY` one) with:

```ts
// A companion turn: stream the LLM reply for the user's transcript, buffer it
// whole, then speak it. replyPlaying goes true for the entire turn (from the
// first token), so a barge-in onset during generation — not just during
// playback — aborts this same controller, cancelling the LLM stream and TTS
// together. On an LLM error (e.g. Ollama down) we simply say nothing and the
// session stays usable.
const startReply = useCallback(
  (prompt: string): void => {
    const tts = ttsRef.current;
    const llm = llmRef.current;
    if (tts === null || llm === null) return;
    const controller = new AbortController();
    turnRef.current = controller;
    setReplyPlaying(true);
    void (async (): Promise<void> => {
      try {
        let reply = "";
        for await (const delta of llm.stream(
          [{ role: "user", content: prompt }],
          { signal: controller.signal },
        )) {
          reply += delta;
        }
        if (
          controller.signal.aborted ||
          turnRef.current !== controller ||
          reply.trim() === ""
        ) {
          return;
        }
        await tts.play(reply, ELISE.voiceId, controller.signal);
      } catch {
        // Aborted turn or LLM failure: no reply.
      } finally {
        // Only clear if this same turn is still active — a newer turn or a
        // barge-in may have superseded us before this settled.
        if (turnRef.current === controller) {
          turnRef.current = null;
          setReplyPlaying(false);
        }
      }
    })();
  },
  [setReplyPlaying],
);
```

- [ ] **Step 3: Create the client in `start()` and pass the transcript to
      `startReply`**

In `start()`, where `ttsRef.current = createTtsPlayer(audioEl);` is set, add the
client just after it:

```ts
ttsRef.current = createTtsPlayer(audioEl);
llmRef.current = createLlmClient();
```

In the `createStt` config, change `onCommitted` to pass the transcript through:

```ts
      onCommitted: (text) => {
        setStatus((s) => ({ ...s, committed: text }));
        startReply(text);
      },
```

- [ ] **Step 4: Clear the client ref in `stop()`**

In `stop()`, alongside `ttsRef.current = null;`, add:

```ts
llmRef.current = null;
```

- [ ] **Step 5: Remove the now-unused `CANNED_REPLY`**

In `src/lib/companions/companions.ts`, delete the `CANNED_REPLY` export (the
canned string and its comment). Leave `ELISE` and the `Companion` type intact.

- [ ] **Step 6: Verify typecheck, lint, and unit tests**

Run: `npm run typecheck && npm run lint && npm test` Expected: all clean; no
reference to `CANNED_REPLY` remains (typecheck fails loudly if one does). Fix
any leftover import.

- [ ] **Step 7: Update the changelog**

In `CHANGELOG.md`, add a **new** heading for the day this lands at the very top
of the file — `## 2026-07-19` (the current date; the existing top heading is
`## 2026-07-18` from the voice I/O foundation work, so this is a fresh section
above it). Under it add — as a `feature` (the only line for the day so far):

```markdown
- feature: **Companion replies for real** — the companion now answers what you
  say with a live, model-generated reply spoken in her own voice, instead of a
  canned line; cut in any time and she stops.
  ([#13](https://github.com/autogoon/autogoon/pull/13))
```

- [ ] **Step 8: Commit**

```bash
git add src/hooks/use-voice-session.ts src/lib/companions/companions.ts CHANGELOG.md
git commit -m "Companions: speak a live LLM reply for the user's transcript"
```

---

### Task 5: Full-phase verification

**Files:** none (verification only).

- [ ] **Step 1: Format, then run every gate**

Run: `npm run format` Then:
`npm run typecheck && npm run lint && npm test && npm run build` Expected: all
clean. If `format` changed files, commit them:

```bash
git add -A
git commit -m "Companions: formatting"
```

- [ ] **Step 2: Manual acceptance (needs `.env` with `ELEVENLABS_API_KEY`,
      `LLM_URL`, `LLM_MODEL`, and Ollama running the companion card)**

On speakers, no headphones:

1. **LLM lab:** type a prompt → tokens stream in → **Stop** aborts mid-stream; a
   wrong `LLM_URL` shows an `Error:` line without breaking the panel.
2. **Voice:** click **Start listening**, say a sentence → a committed transcript
   appears (the voice I/O foundation's STT) → Elise speaks a **model-generated**
   reply (not the old canned line).
3. **Barge-in:** speak over the reply → it **cuts within a beat**, your opening
   word intact; barge-in **during generation** (before audio starts) also stops
   the turn — no late reply arrives.
4. Ollama unreachable → the voice session stays usable: you're still
   transcribed, just no reply.

- [ ] **Step 3: Confirm the PR description**

This phase lands on the existing `companions` branch / draft PR #13. Tick the PR
checklist entry for this work (per the per-phase PR convention). Do not merge —
the whole feature merges together once the final companion lands.
