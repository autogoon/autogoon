import { describe, it, expect, beforeEach, jest } from "@jest/globals";

type ReasoningDelta = { index: number; type?: string; text?: string };
type Chunk = {
  choices: {
    delta: { content?: string; reasoning_details?: ReasoningDelta[] };
  }[];
};
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

// A fake stream whose chunks carry only reasoning_details deltas (and one final
// content chunk), for exercising the reasoning capture path.
function fakeReasoningStream(
  chunks: Chunk["choices"][0]["delta"][],
): AsyncIterable<Chunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of chunks) yield { choices: [{ delta }] };
    },
  };
}

describe("createLlmClient", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("yields concatenated token deltas and skips empty ones", async () => {
    createMock.mockResolvedValue(fakeStream(["Hi", undefined, " there", "!"]));
    const { createLlmClient } = await import("./client");
    const client = createLlmClient("test-model");
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
    const client = createLlmClient("test-model");
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

  it("fires onReasoning once with reasoning_details merged by index", async () => {
    createMock.mockResolvedValue(
      fakeReasoningStream([
        {
          reasoning_details: [
            { index: 0, type: "reasoning.text", text: "Let me" },
          ],
        },
        { reasoning_details: [{ index: 0, text: " think" }] },
        { content: "Answer" },
      ]),
    );
    const { createLlmClient } = await import("./client");
    const client = createLlmClient("test-model");
    const seen: unknown[][] = [];
    const tokens = await collect(
      client.stream([{ role: "user", content: "hi" }], {
        signal: new AbortController().signal,
        onReasoning: (d) => seen.push(d),
      }),
    );
    expect(tokens).toEqual(["Answer"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([
      { index: 0, type: "reasoning.text", text: "Let me think" },
    ]);
  });

  it("never fires onReasoning for a content-only stream", async () => {
    createMock.mockResolvedValue(fakeStream(["Hi", " there"]));
    const { createLlmClient } = await import("./client");
    const client = createLlmClient("test-model");
    const onReasoning = jest.fn();
    await collect(
      client.stream([{ role: "user", content: "hi" }], {
        signal: new AbortController().signal,
        onReasoning,
      }),
    );
    expect(onReasoning).not.toHaveBeenCalled();
  });

  it("maps a message's reasoningDetails to reasoning_details on the wire", async () => {
    createMock.mockResolvedValue(fakeStream(["ok"]));
    const { createLlmClient } = await import("./client");
    const client = createLlmClient("test-model");
    await collect(
      client.stream(
        [
          { role: "user", content: "hi" },
          {
            role: "assistant",
            content: "prev",
            reasoningDetails: [{ index: 0, text: "x" }],
          },
        ],
        { signal: new AbortController().signal },
      ),
    );
    const [params] = createMock.mock.calls[0] as [{ messages: unknown[] }];
    expect(params.messages).toEqual([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "prev",
        reasoning_details: [{ index: 0, text: "x" }],
      },
    ]);
  });
});
