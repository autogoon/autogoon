# Companions — Slice 1 (Voice I/O Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real `Companions` algorithm screen that proves the voice loop — speak → live ElevenLabs transcript → Elise's ~11 s canned reply → barge-in cuts it within a beat, opening word intact — on speakers with no headphones.

**Architecture:** Pure, unit-tested logic (audio encoding, pre-roll ring buffer, energy-VAD state machine, session-policy decisions) is separated from the effectful integration (AudioWorklet capture, `getUserMedia`, the STT WebSocket, MediaSource TTS playback, the orchestrator hook, the panel) — mirroring the repo's engine/Player split. Secrets stay in two server routes; the client uses a single-use STT token and a TTS proxy. The panel is a degenerate algorithm panel: it hosts the voice-lab UI and does **not** arm the Player.

**Tech Stack:** Next 16 (App Router) · React 19 · TypeScript · `@elevenlabs/elevenlabs-js` (server-side) · Web Audio / AudioWorklet · raw browser `WebSocket` · Jest (`@jest/globals`, node env).

## Global Constraints

- Read the specs first: `docs/superpowers/specs/2026-07-18-companions-design.md` and `docs/superpowers/specs/2026-07-18-companions-slice-1-voice-io.md`. This section restates the load-bearing constraints; those docs are the source of truth.
- Branch: **`companions`** (already checked out). Never commit to `main`.
- **Secrets:** `ELEVENLABS_API_KEY` is read **only** in server route handlers. Never `NEXT_PUBLIC_*`; never referenced in a client component or a file that ships to the browser bundle. The repo is public.
- **Zero-warning:** `npm run lint` (`--max-warnings 0`) and `npm run typecheck` must both be completely clean before any commit. Fix every warning, including incidental ones.
- **Tests:** Jest, colocated `*.test.ts`, node environment, import from `@jest/globals`. Cover pure logic only.
- **Verification beyond tests:** `npm run build` (runs `tsc`), then drive the app in the browser for the acceptance bar. Hardware/audio behaviour is not unit-tested.
- **Format:** run `npm run format` before committing; commit any files it changes.
- **Changelog:** add a `feature` entry under `## 2026-07-18` before the slice is considered done.
- **TTS model** is `eleven_v3`; **STT** uses `commit_strategy=vad`; **silence-close** is 8 s; Elise's `voiceId` is `exHJXWRRhHzWYCoZrSF1`.

## File Structure

**Pure logic (unit-tested):**

- `src/lib/companions/companions.ts` — `Companion` type + `ELISE` + `CANNED_REPLY`.
- `src/lib/voice/audio-encoding.ts` — `downsampleTo16k`, `floatTo16BitPcm`, `pcm16ToBase64`.
- `src/lib/voice/pre-roll.ts` — `PreRollBuffer` ring buffer.
- `src/lib/voice/vad.ts` — `initVadState`, `vadStep` energy-VAD state machine.
- `src/lib/voice/session-policy.ts` — `shouldOpenSocket`, `shouldCloseSocket`, `isBargeIn`.

**Server routes (tested with mocks):**

- `src/app/api/stt-token/route.ts` — mints the realtime-scribe single-use token.
- `src/app/api/tts/route.ts` — streams `eleven_v3` mp3 back to the browser.

**Integration (build + manual acceptance):**

- `public/companion-audio-worklet.js` — capture worklet (downsample + energy + ring buffer).
- `src/lib/voice/mic.ts` — `getUserMedia` (AEC) + worklet wiring + event stream.
- `src/lib/voice/stt.ts` — STT socket lifecycle (uses `session-policy`).
- `src/lib/voice/tts.ts` — MediaSource playback + `stop()`.
- `src/hooks/use-voice-session.ts` — orchestrator (one `AbortController` per turn).
- `src/components/algorithms/companions-panel.tsx` — the voice-lab panel.
- `src/app/page.tsx` — register the `companions` `ALGORITHMS` entry + render the panel.

---

### Task 1: Companion config, Elise, and the canned reply

**Files:**

- Create: `src/lib/companions/companions.ts`
- Test: `src/lib/companions/companions.test.ts`

**Interfaces:**

- Produces: `type Companion = { name: string; gender: "female" | "male" | "nonbinary"; voiceId: string }`; `const ELISE: Companion`; `const CANNED_REPLY: string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/companions/companions.test.ts
import { describe, it, expect } from "@jest/globals";
import { ELISE, CANNED_REPLY } from "./companions";

describe("Elise", () => {
  it("has the configured voice id and presentation", () => {
    expect(ELISE.voiceId).toBe("exHJXWRRhHzWYCoZrSF1");
    expect(ELISE.gender).toBe("female");
    expect(ELISE.name).toBe("Elise");
  });

  it("has a canned reply long enough to barge in on (~11s of speech)", () => {
    const words = CANNED_REPLY.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/companions/companions.test.ts`
Expected: FAIL — cannot find module `./companions`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/companions/companions.ts
export type Companion = {
  name: string;
  gender: "female" | "male" | "nonbinary";
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  // systemPrompt / generationBias / initiative / agency arrive in later slices.
};

export const ELISE: Companion = {
  name: "Elise",
  gender: "female",
  voiceId: "exHJXWRRhHzWYCoZrSF1",
};

// A fixed reply for Slice 1 (no LLM yet). ~33 words ≈ 11s spoken.
export const CANNED_REPLY =
  "Mmm, hi baby. I was starting to think you'd forgotten about me. " +
  "Don't keep me waiting like that — you know I get restless. " +
  "Come here and tell me what you've been thinking about.";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/companions/companions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/companions/
git commit -m "Companions: Elise config and canned reply"
```

---

### Task 2: Audio encoding (downsample → PCM16 → base64)

**Files:**

- Create: `src/lib/voice/audio-encoding.ts`
- Test: `src/lib/voice/audio-encoding.test.ts`

**Interfaces:**

- Produces:
  - `downsampleTo16k(input: Float32Array, inputRate: number): Float32Array` — decimating resample to 16 kHz; returns `input` unchanged if `inputRate === 16000`.
  - `floatTo16BitPcm(input: Float32Array): Int16Array` — clamps to [-1, 1], scales to int16.
  - `pcm16ToBase64(pcm: Int16Array): string` — little-endian bytes, base64. Uses `Buffer` (node) or `btoa` fallback; in the browser worklet path we only need `floatTo16BitPcm` — base64 happens on the main thread where `btoa` exists.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/voice/audio-encoding.test.ts
import { describe, it, expect } from "@jest/globals";
import {
  downsampleTo16k,
  floatTo16BitPcm,
  pcm16ToBase64,
} from "./audio-encoding";

describe("audio-encoding", () => {
  it("returns input unchanged when already 16k", () => {
    const buf = new Float32Array([0, 0.5, -0.5]);
    expect(downsampleTo16k(buf, 16000)).toBe(buf);
  });

  it("halves the sample count from 32k to 16k", () => {
    const buf = new Float32Array(320); // 10ms @ 32k
    const out = downsampleTo16k(buf, 32000);
    expect(out.length).toBe(160); // 10ms @ 16k
  });

  it("downsamples 48k → 16k at a 1/3 ratio", () => {
    const out = downsampleTo16k(new Float32Array(480), 48000);
    expect(out.length).toBe(160);
  });

  it("clamps and scales floats to int16", () => {
    const out = floatTo16BitPcm(new Float32Array([0, 1, -1, 2, -2]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(32767);
    expect(out[2]).toBe(-32768);
    expect(out[3]).toBe(32767); // clamped
    expect(out[4]).toBe(-32768); // clamped
  });

  it("base64-encodes little-endian pcm16", () => {
    // 0x0100 little-endian = bytes [0x00, 0x01]
    expect(pcm16ToBase64(new Int16Array([256]))).toBe(
      Buffer.from([0, 1]).toString("base64"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/voice/audio-encoding.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/voice/audio-encoding.ts
export function downsampleTo16k(
  input: Float32Array,
  inputRate: number,
): Float32Array {
  if (inputRate === 16000) return input;
  if (inputRate < 16000) throw new Error(`inputRate ${inputRate} below 16000`);
  const ratio = inputRate / 16000;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    // Average the source window for a cheap anti-alias.
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    out[i] = sum / (end - start);
  }
  return out;
}

export function floatTo16BitPcm(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  if (typeof Buffer !== "undefined")
    return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/voice/audio-encoding.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/audio-encoding.ts src/lib/voice/audio-encoding.test.ts
git commit -m "Companions: audio encoding (downsample, pcm16, base64)"
```

---

### Task 3: Pre-roll ring buffer

**Files:**

- Create: `src/lib/voice/pre-roll.ts`
- Test: `src/lib/voice/pre-roll.test.ts`

**Interfaces:**

- Produces: `class PreRollBuffer` — `constructor(maxFrames: number)`, `push(frame: Int16Array): void`, `flush(): Int16Array[]` (oldest-first, then clears), `get length(): number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/voice/pre-roll.test.ts
import { describe, it, expect } from "@jest/globals";
import { PreRollBuffer } from "./pre-roll";

const f = (n: number) => new Int16Array([n]);

describe("PreRollBuffer", () => {
  it("keeps only the most recent maxFrames", () => {
    const b = new PreRollBuffer(2);
    b.push(f(1));
    b.push(f(2));
    b.push(f(3)); // evicts f(1)
    expect(b.length).toBe(2);
    expect(b.flush().map((x) => x[0])).toEqual([2, 3]); // oldest-first
  });

  it("flush clears the buffer", () => {
    const b = new PreRollBuffer(4);
    b.push(f(1));
    expect(b.flush().map((x) => x[0])).toEqual([1]);
    expect(b.length).toBe(0);
    expect(b.flush()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/voice/pre-roll.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/voice/pre-roll.ts
// A fixed-capacity ring of recent PCM frames, always recording so barge-in can
// flush the user's opening word into a freshly-opened STT socket.
export class PreRollBuffer {
  private frames: Int16Array[] = [];
  constructor(private readonly maxFrames: number) {}

  push(frame: Int16Array): void {
    this.frames.push(frame);
    if (this.frames.length > this.maxFrames) this.frames.shift();
  }

  flush(): Int16Array[] {
    const out = this.frames;
    this.frames = [];
    return out;
  }

  get length(): number {
    return this.frames.length;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/voice/pre-roll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/pre-roll.ts src/lib/voice/pre-roll.test.ts
git commit -m "Companions: pre-roll ring buffer"
```

---

### Task 4: Energy VAD state machine

**Files:**

- Create: `src/lib/voice/vad.ts`
- Test: `src/lib/voice/vad.test.ts`

**Interfaces:**

- Produces:
  - `type VadConfig = { onRms: number; offRms: number; attackFrames: number; hangoverFrames: number }`
  - `type VadState = { speaking: boolean; above: number; below: number }`
  - `initVadState(): VadState`
  - `vadStep(state: VadState, rms: number, cfg: VadConfig): { state: VadState; onset: boolean; offset: boolean }` — pure; `onset` true on the frame speech is confirmed, `offset` true on the frame silence is confirmed. Hysteresis via separate on/off thresholds + attack/hangover frame counts.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/voice/vad.test.ts
import { describe, it, expect } from "@jest/globals";
import { initVadState, vadStep, type VadConfig } from "./vad";

const CFG: VadConfig = {
  onRms: 0.05,
  offRms: 0.02,
  attackFrames: 2,
  hangoverFrames: 3,
};

function run(rmsSeq: number[]) {
  let s = initVadState();
  const events: string[] = [];
  for (const rms of rmsSeq) {
    const r = vadStep(s, rms, CFG);
    s = r.state;
    if (r.onset) events.push("onset");
    if (r.offset) events.push("offset");
  }
  return { speaking: s.speaking, events };
}

describe("vadStep", () => {
  it("fires onset only after attackFrames above onRms", () => {
    expect(run([0.1]).events).toEqual([]); // 1 frame, not yet
    expect(run([0.1, 0.1]).events).toEqual(["onset"]); // 2 frames confirm
  });

  it("does not fire onset on a single loud blip (debounced)", () => {
    expect(run([0.1, 0, 0, 0]).events).toEqual([]);
  });

  it("fires offset only after hangoverFrames below offRms", () => {
    const r = run([0.1, 0.1, 0.01, 0.01, 0.01]);
    expect(r.events).toEqual(["onset", "offset"]);
    expect(r.speaking).toBe(false);
  });

  it("stays speaking through a short dip above offRms", () => {
    const r = run([0.1, 0.1, 0.03, 0.03, 0.1]); // 0.03 is between off and on
    expect(r.events).toEqual(["onset"]);
    expect(r.speaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/voice/vad.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/voice/vad.ts
export type VadConfig = {
  onRms: number; // enter "speaking" above this
  offRms: number; // leave "speaking" below this (offRms < onRms → hysteresis)
  attackFrames: number; // consecutive above-onRms frames to confirm onset
  hangoverFrames: number; // consecutive below-offRms frames to confirm offset
};

export type VadState = { speaking: boolean; above: number; below: number };

export function initVadState(): VadState {
  return { speaking: false, above: 0, below: 0 };
}

export function vadStep(
  state: VadState,
  rms: number,
  cfg: VadConfig,
): { state: VadState; onset: boolean; offset: boolean } {
  let { speaking, above, below } = state;
  let onset = false;
  let offset = false;

  if (rms >= cfg.onRms) {
    above += 1;
    below = 0;
    if (!speaking && above >= cfg.attackFrames) {
      speaking = true;
      onset = true;
    }
  } else if (rms < cfg.offRms) {
    below += 1;
    above = 0;
    if (speaking && below >= cfg.hangoverFrames) {
      speaking = false;
      offset = true;
    }
  } else {
    // Between thresholds: hold state, reset the opposing counter.
    if (speaking) below = 0;
    else above = 0;
  }

  return { state: { speaking, above, below }, onset, offset };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/voice/vad.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/vad.ts src/lib/voice/vad.test.ts
git commit -m "Companions: energy-VAD state machine with hysteresis"
```

---

### Task 5: Session policy (open/close/barge-in decisions)

**Files:**

- Create: `src/lib/voice/session-policy.ts`
- Test: `src/lib/voice/session-policy.test.ts`

**Interfaces:**

- Produces:
  - `type SttPhase = "closed" | "connecting" | "open" | "closing"`
  - `shouldOpenSocket(phase: SttPhase, onset: boolean): boolean`
  - `shouldCloseSocket(phase: SttPhase, lastVoiceAtMs: number, nowMs: number, timeoutMs: number): boolean`
  - `isBargeIn(replyPlaying: boolean, onset: boolean): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/voice/session-policy.test.ts
import { describe, it, expect } from "@jest/globals";
import {
  shouldOpenSocket,
  shouldCloseSocket,
  isBargeIn,
} from "./session-policy";

describe("session-policy", () => {
  it("opens on onset only when closed", () => {
    expect(shouldOpenSocket("closed", true)).toBe(true);
    expect(shouldOpenSocket("closed", false)).toBe(false);
    expect(shouldOpenSocket("open", true)).toBe(false);
    expect(shouldOpenSocket("connecting", true)).toBe(false);
  });

  it("closes an open socket after the quiet timeout", () => {
    expect(shouldCloseSocket("open", 1000, 1000 + 8000, 8000)).toBe(true);
    expect(shouldCloseSocket("open", 1000, 1000 + 7999, 8000)).toBe(false);
    expect(shouldCloseSocket("closed", 0, 999999, 8000)).toBe(false);
  });

  it("is a barge-in only when a reply is playing and speech onsets", () => {
    expect(isBargeIn(true, true)).toBe(true);
    expect(isBargeIn(false, true)).toBe(false);
    expect(isBargeIn(true, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/voice/session-policy.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/voice/session-policy.ts
// Pure decisions for the STT socket lifecycle and barge-in, kept out of the
// effectful socket/audio code so they can be unit-tested.
export type SttPhase = "closed" | "connecting" | "open" | "closing";

export function shouldOpenSocket(phase: SttPhase, onset: boolean): boolean {
  return onset && phase === "closed";
}

export function shouldCloseSocket(
  phase: SttPhase,
  lastVoiceAtMs: number,
  nowMs: number,
  timeoutMs: number,
): boolean {
  return phase === "open" && nowMs - lastVoiceAtMs >= timeoutMs;
}

export function isBargeIn(replyPlaying: boolean, onset: boolean): boolean {
  return replyPlaying && onset;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/voice/session-policy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/session-policy.ts src/lib/voice/session-policy.test.ts
git commit -m "Companions: session-policy (open/close/barge-in) decisions"
```

---

### Task 6: STT token route

**Files:**

- Create: `src/app/api/stt-token/route.ts`
- Test: `src/app/api/stt-token/route.test.ts`

**Interfaces:**

- Consumes: `ELEVENLABS_API_KEY` from `process.env`.
- Produces: `POST` handler returning `Response` with JSON `{ token: string }` (200), or `{ error }` (500 on upstream failure, 503 if the key is missing). Never includes the api key in the response.

**Note:** implemented with a direct `fetch` to keep the handler independent of SDK surface changes; the SDK is used for TTS (Task 7). The test mocks `global.fetch`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/stt-token/route.test.ts
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

describe("POST /api/stt-token", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "sk_test_key";
  });

  it("returns a token from the upstream single-use-token endpoint", async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(JSON.stringify({ token: "sutkn_abc" }), { status: 200 }),
    );
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "sutkn_abc" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/single-use-token/realtime_scribe");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(
      "sk_test_key",
    );
  });

  it("503s when the key is missing without calling upstream", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/api/stt-token/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/stt-token/route.ts
export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY not set" },
      { status: 503 },
    );
  }
  const upstream = await fetch(
    "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
    { method: "POST", headers: { "xi-api-key": key } },
  );
  if (!upstream.ok) {
    return Response.json({ error: "token mint failed" }, { status: 500 });
  }
  const { token } = (await upstream.json()) as { token: string };
  return Response.json({ token });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/api/stt-token/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stt-token/
git commit -m "Companions: STT single-use-token route"
```

---

### Task 7: TTS proxy route (SDK, eleven_v3, streaming)

**Files:**

- Create: `src/app/api/tts/route.ts`
- Test: `src/app/api/tts/route.test.ts`

**Interfaces:**

- Consumes: `ELEVENLABS_API_KEY`; request body `{ text: string; voiceId: string }`.
- Produces: `POST` handler streaming `audio/mpeg`. Uses `new ElevenLabsClient({ apiKey }).textToSpeech.stream(voiceId, { modelId: "eleven_v3", text, outputFormat: "mp3_44100_128" })`, piping the async-iterable chunks into a `ReadableStream` body. 400 on missing body fields, 503 on missing key.

**Note:** the test mocks `@elevenlabs/elevenlabs-js` so no network is hit. Confirm the exact SDK stream method name against the installed version (`node -e "console.log(Object.keys(require('@elevenlabs/elevenlabs-js')))"` and inspect `textToSpeech`) and adjust `textToSpeech.stream` if the installed 2.58.0 names it `convertAsStream`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/tts/route.test.ts
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const streamMock = jest.fn();
jest.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    textToSpeech = { stream: streamMock };
  },
}));

async function* fakeAudio() {
  yield new Uint8Array([1, 2, 3]);
  yield new Uint8Array([4, 5]);
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/tts", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/tts", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "sk_test_key";
    streamMock.mockReset();
  });

  it("streams mp3 audio for the given text and voice", async () => {
    streamMock.mockReturnValue(fakeAudio());
    const { POST } = await import("./route");
    const res = await POST(
      req({ text: "hi", voiceId: "exHJXWRRhHzWYCoZrSF1" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
    expect(streamMock.mock.calls[0][0]).toBe("exHJXWRRhHzWYCoZrSF1");
    expect((streamMock.mock.calls[0][1] as { modelId: string }).modelId).toBe(
      "eleven_v3",
    );
  });

  it("400s when text is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ voiceId: "x" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/api/tts/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/tts/route.ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key)
    return Response.json(
      { error: "ELEVENLABS_API_KEY not set" },
      { status: 503 },
    );

  const { text, voiceId } = (await request.json()) as {
    text?: string;
    voiceId?: string;
  };
  if (!text || !voiceId)
    return Response.json(
      { error: "text and voiceId required" },
      { status: 400 },
    );

  const client = new ElevenLabsClient({ apiKey: key });
  const audio = await client.textToSpeech.stream(voiceId, {
    modelId: "eleven_v3",
    text,
    outputFormat: "mp3_44100_128",
  });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of audio as AsyncIterable<Uint8Array>) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(body, { headers: { "content-type": "audio/mpeg" } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/api/tts/route.test.ts`
Expected: PASS. If it fails on the SDK method name, correct `textToSpeech.stream` per the version note above and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tts/
git commit -m "Companions: TTS proxy route (eleven_v3 streaming via SDK)"
```

---

### Task 8: Capture worklet

**Files:**

- Create: `public/companion-audio-worklet.js`

**Interfaces:**

- Produces: an `AudioWorkletProcessor` registered as `"companion-capture"`. Each render quantum: accumulates mono input, and on ~20 ms boundaries computes the frame RMS and posts `{ samples: Float32Array, rms: number }` (the raw input-rate mono frame, transferring the buffer). The **downsample → PCM16 → base64 DSP happens on the main thread** via `audio-encoding.ts` (Task 2) — the worklet does not duplicate it, so that tested code is the single runtime implementation. It also emits `capture.connect(destination)` silence upstream, matching the existing `kws-audio-worklet.js` pattern so the graph pulls it.

**Verification:** integration — no unit test. Verified in Task 13's acceptance run (frames arrive; RMS tracks speech). Mirror the structure of `public/kws-audio-worklet.js`.

- [ ] **Step 1: Implement the worklet**

```js
// public/companion-audio-worklet.js
// Captures mono mic audio and posts { samples, rms } frames (~20ms of raw
// input-rate audio) to the main thread, which downsamples/encodes via
// audio-encoding.ts. Mirrors kws-audio-worklet.js.
class CompanionCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._frameSamples = Math.round(sampleRate * 0.02); // 20ms at the input rate
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
      while (this._buf.length >= this._frameSamples) {
        const frame = Float32Array.from(this._buf.splice(0, this._frameSamples));
        let sumSq = 0;
        for (let i = 0; i < frame.length; i++) sumSq += frame[i] * frame[i];
        const rms = Math.sqrt(sumSq / frame.length);
        this.port.postMessage({ samples: frame, rms }, [frame.buffer]);
      }
    }
    return true;
  }
}

registerProcessor("companion-capture", CompanionCapture);
```

- [ ] **Step 2: Type/lint gate**

Run: `npm run typecheck && npm run lint`
Expected: clean (the `.js` worklet is not typechecked; ensure nothing else regressed).

- [ ] **Step 3: Commit**

```bash
git add public/companion-audio-worklet.js
git commit -m "Companions: capture worklet (16k downsample + RMS frames)"
```

---

### Task 9: Mic capture (AEC + worklet wiring)

**Files:**

- Create: `src/lib/voice/mic.ts`

**Interfaces:**

- Consumes: `PreRollBuffer` (Task 3), `initVadState`/`vadStep` (Task 4), `downsampleTo16k`/`floatTo16BitPcm`/`pcm16ToBase64` (Task 2).
- Produces:
  ```ts
  type MicEvents = {
    onFrame: (base64Pcm: string) => void; // 16k pcm frame, base64
    onRms: (rms: number) => void;
    onOnset: () => void;
    onOffset: () => void;
  };
  async function startMic(events: MicEvents): Promise<MicHandle>;
  type MicHandle = { preRoll: PreRollBuffer; stop: () => void };
  ```
  `startMic` opens `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`, loads the worklet, and on each `{ samples, rms }`: does the DSP on the main thread via Task 2 — `const pcm16 = floatTo16BitPcm(downsampleTo16k(samples, audioContext.sampleRate))` — pushes `pcm16` to `preRoll`, calls `onRms(rms)`, runs `vadStep` on `rms` (firing `onOnset`/`onOffset`), and calls `onFrame(pcm16ToBase64(pcm16))`. This keeps `audio-encoding.ts` as the single, tested DSP path (the worklet does not reimplement it).

**Verification:** integration — no unit test (needs a real mic + worklet). Verified in Task 13.

- [ ] **Step 1: Implement** (VAD config: `{ onRms: 0.05, offRms: 0.02, attackFrames: 3, hangoverFrames: 5 }` — tune during acceptance). Pre-roll capacity: `Math.ceil(500 / 20)` = 25 frames (~500 ms). Follow `keyword-spotter.tsx:238-273` for the AudioContext/worklet lifecycle (resume the context; connect capture → destination). Load module from `/companion-audio-worklet.js`.

- [ ] **Step 2: Gate**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/voice/mic.ts
git commit -m "Companions: mic capture with AEC + VAD + pre-roll"
```

---

### Task 10: STT socket client

**Files:**

- Create: `src/lib/voice/stt.ts`

**Interfaces:**

- Consumes: `session-policy` (Task 5); the `/api/stt-token` route (Task 6).
- Produces:
  ```ts
  type SttEvents = {
    onPartial: (text: string) => void;
    onCommitted: (text: string) => void;
    onPhase: (phase: SttPhase) => void;
  };
  function createStt(events: SttEvents): {
    open: (preRoll: Int16Array[]) => Promise<void>; // fetch token, connect, flush pre-roll first
    sendFrame: (base64Pcm: string) => void; // no-op unless open
    noteVoice: (nowMs: number) => void; // updates lastVoiceAt
    maybeClose: (nowMs: number, timeoutMs: number) => void; // uses shouldCloseSocket
    close: () => void;
    phase: () => SttPhase;
  };
  ```
  `open` POSTs `/api/stt-token`, connects to `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=…&audio_format=pcm_16000&commit_strategy=vad`, and on `session_started` flushes the pre-roll frames (each via `sendFrame`). Parses `partial_transcript` / `committed_transcript` messages.

**Verification:** integration — no unit test (the pure decisions it relies on are already tested in Task 5). Verified in Task 13.

- [ ] **Step 1: Implement.** Message send shape: `JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: base64Pcm, commit: false })`. On incoming message, switch on `message_type`. Call `onPhase` on every transition. Guard `sendFrame` on `ws.readyState === WebSocket.OPEN`.

- [ ] **Step 2: Gate**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/voice/stt.ts
git commit -m "Companions: realtime STT socket client"
```

---

### Task 11: TTS playback with hard stop

**Files:**

- Create: `src/lib/voice/tts.ts`

**Interfaces:**

- Consumes: the `/api/tts` route (Task 7).
- Produces:
  ```ts
  function createTtsPlayer(audioEl: HTMLAudioElement): {
    play: (text: string, voiceId: string, signal: AbortSignal) => Promise<void>; // resolves when playback ends or is aborted
    stop: () => void; // pause + reset immediately
  };
  ```
  `play` POSTs `/api/tts` with `{ text, voiceId }` and `signal`, feeds the streamed mp3 into a `MediaSource` attached to `audioEl` (append chunks to a `SourceBuffer`), and `audioEl.play()`s. `signal.aborted` → `stop()` (pause, clear `src`, abort the fetch). Progressive playback; instant stop.

**Verification:** integration — no unit test. Verified in Task 13. If MediaSource mp3 buffering proves fiddly, fall back to buffering the full response into a Blob URL for Slice 1 (still stops instantly on `pause()`); note which path was used.

- [ ] **Step 1: Implement** with the MediaSource append loop reading the fetch `body.getReader()`; on `signal`, `reader.cancel()` + `stop()`.

- [ ] **Step 2: Gate**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/voice/tts.ts
git commit -m "Companions: streaming TTS playback with hard stop"
```

---

### Task 12: Orchestrator hook

**Files:**

- Create: `src/hooks/use-voice-session.ts`

**Interfaces:**

- Consumes: `startMic` (9), `createStt` (10), `createTtsPlayer` (11), `session-policy` (5), `ELISE`/`CANNED_REPLY` (1).
- Produces: `useVoiceSession()` returning `{ start, stop, status }` where `status` exposes `{ micOn, phase, vadSpeaking, rms, preRollFrames, partial, committed, replyPlaying }` for the panel.
- Behaviour, one `AbortController` per turn:
  - `onOnset`: if `isBargeIn(replyPlaying, true)` → `controller.abort()` (stops TTS) then open a fresh turn; else if `shouldOpenSocket(phase, true)` → open STT (flush pre-roll), record `lastVoiceAt`.
  - `onFrame`: `sendFrame` while open.
  - `onRms`/`noteVoice`: update `lastVoiceAt` when `vadSpeaking`.
  - `onCommitted`: create a new `AbortController`, set `replyPlaying`, `ttsPlayer.play(CANNED_REPLY, ELISE.voiceId, signal)`, clear `replyPlaying` on resolve.
  - A `setInterval(500ms)` tick calls `maybeClose(now, 8000)`.

**Verification:** integration — no unit test (decisions tested in Task 5). Verified in Task 13.

- [ ] **Step 1: Implement** the hook, wiring the four modules; keep all timers/subscriptions cleaned up in the `stop()` path and on unmount.

- [ ] **Step 2: Gate**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-voice-session.ts
git commit -m "Companions: voice-session orchestrator (single AbortController per turn)"
```

---

### Task 13: Companions panel + algorithm registration + acceptance

**Files:**

- Create: `src/components/algorithms/companions-panel.tsx`
- Modify: `src/app/page.tsx` (add the `companions` `ALGORITHMS` entry + render/import the panel — follow `DEVELOPERS.md#adding-an-algorithm`, minus the engine).

**Interfaces:**

- Consumes: `useVoiceSession` (12).
- Produces: `CompanionsPanel` — a start/stop mic toggle plus the live status readout (AEC-on, VAD state + RMS meter, STT phase + pre-roll frames, partial/committed transcript, reply playing + elapsed, an event log). Does **not** arm the Player. The `ALGORITHMS` entry: `{ id: "companions", label: "Companions", description: "…", accent: "…" }` — pick an accent distinct from the others.

- [ ] **Step 1: Implement** the panel + register the entry in `page.tsx`. Match the panel signature the other panels use where relevant, but omit engine/Player wiring.

- [ ] **Step 2: Gate — full suite**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Manual acceptance (the real bar — speakers, no headphones)**

Run: `npm run dev`, open `http://localhost:8931`, go to **Companions**, start mic, and confirm against the spec's acceptance criteria:

1. Speaking yields a committed transcript.
2. Elise's ~11 s reply plays in her voice.
3. Speaking over it cuts within ~250 ms; the new words transcribe with no lost opening word.
4. Elise's own voice never appears in the transcript and never falsely barges-in while you're quiet.
5. The STT socket closes after ~8 s of silence and reopens on the next onset.

Tune the VAD thresholds (Task 9) if onset is too eager/sluggish. Requires `.env.local` with `ELEVENLABS_API_KEY` (and Ollama vars are irrelevant this slice).

- [ ] **Step 4: Changelog + commit**

Add under `## 2026-07-18` in `CHANGELOG.md`:
`- feature: **Companions (voice)** — talk to Elise: live transcription, a spoken reply, and interrupt-to-barge-in. ([#N](https://github.com/autogoon/autogoon/pull/N))`

Then:

```bash
npm run format
git add -A
git commit -m "Companions: voice-lab panel + algorithm registration"
```

---

## Self-Review

**Spec coverage:** AEC (Task 9), realtime STT + token (6, 10), streaming TTS eleven_v3 (7, 11), local energy-VAD (4, 9), pre-roll (3, 9), STT lifecycle + 8 s close (5, 10, 12), single-AbortController barge-in (12), algorithm shell (13), Elise + canned reply (1), key safety (6, 7), acceptance bar (13). All present.

**Placeholder scan:** integration tasks (8–13) intentionally carry implementation guidance + interfaces rather than full code where the code is browser-audio/socket wiring that must be verified against real APIs; each still names exact files, signatures, message shapes, and a concrete verification step. No `TODO`/`handle errors`-style hand-waves in the pure-logic tasks (1–7), which carry complete code + tests.

**Type consistency:** `SttPhase` is defined once (Task 5) and consumed by 10/12. `PreRollBuffer.flush()` returns `Int16Array[]`, consumed by `stt.open(preRoll)` (10) and produced by mic (9). `pcm16ToBase64` (2) feeds `onFrame` (9) → `sendFrame` (10). `AbortSignal` flows from the hook (12) into `ttsPlayer.play` (11). Consistent.

**Open risk flagged in-plan:** the SDK stream method name (`textToSpeech.stream` vs `convertAsStream`) is verified against 2.58.0 in Task 7; MediaSource mp3 has a documented Blob fallback in Task 11.
