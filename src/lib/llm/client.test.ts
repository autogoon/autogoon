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
});
