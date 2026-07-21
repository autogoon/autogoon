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
    headers: { "content-type": "application/json", "x-access-id": "test-key" },
    signal,
  });
}

describe("POST /api/llm/chat/completions", () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    process.env.LLM_URL = "https://openrouter.test/api/v1";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    // The gate is fail-closed, so the route needs a valid access context; these
    // tests exercise the route's own logic with access already granted (the gate
    // itself has its own tests). req() sends the matching x-access-id header.
    process.env.COMPANIONS_ACCESS_IDS = "test-key";
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
