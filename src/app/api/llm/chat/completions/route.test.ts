import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

function sseBody(): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const lines = [
    'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l));
      controller.close();
    },
  });
}

function req(
  body: unknown,
  {
    signal,
    accessId = 'test-key',
  }: { signal?: AbortSignal; accessId?: string } = {},
): Request {
  return new Request('http://localhost/api/llm/chat/completions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-access-id': accessId },
    signal,
  });
}

describe('POST /api/llm/chat/completions', () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    process.env.LLM_URL = 'https://openrouter.test/api/v1';
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    // The gate is fail-closed: req() sends the matching x-access-id header.
    process.env.COMPANIONS_ACCESS_IDS = 'test-key';
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    delete process.env.LLM_URL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.COMPANIONS_ACCESS_IDS;
    jest.restoreAllMocks();
  });

  it('forwards the completion to LLM_URL/chat/completions with OPENROUTER_API_KEY as a bearer token', async () => {
    fetchMock.mockResolvedValue(new Response(sseBody(), { status: 200 }));
    const { POST } = await import('./route');
    await POST(
      req({ messages: [{ role: 'user', content: 'hi' }], stream: true }),
    );

    const [urlArg, initArg] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(urlArg).toBe('https://openrouter.test/api/v1/chat/completions');
    const headers = initArg.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-or-test');
    const sent = JSON.parse(initArg.body as string) as {
      messages: unknown;
      stream: boolean;
    };
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(sent.stream).toBe(true);
  });

  it('sends the model the client asked for rather than substituting one server-side', async () => {
    fetchMock.mockResolvedValue(new Response(sseBody(), { status: 200 }));
    const { POST } = await import('./route');
    await POST(req({ model: 'minimax/minimax-m2:nitro', messages: [] }));

    const initArg = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const sent = JSON.parse(initArg.body as string) as { model: string };
    expect(sent.model).toBe('minimax/minimax-m2:nitro');
  });

  it('streams the upstream SSE body back as text/event-stream', async () => {
    fetchMock.mockResolvedValue(
      new Response(sseBody(), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const { POST } = await import('./route');
    const res = await POST(req({ messages: [], stream: true }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const text = await res.text();
    expect(text).toContain('"content":"Hi"');
    expect(text).toContain('[DONE]');
  });

  it('aborts the upstream generation when the client aborts its request', async () => {
    fetchMock.mockResolvedValue(new Response(sseBody(), { status: 200 }));
    const controller = new AbortController();
    const { POST } = await import('./route');
    await POST(
      req({ messages: [], stream: true }, { signal: controller.signal }),
    );

    // Request() wraps the given signal in a following signal, so identity with
    // controller.signal never holds — abort propagation is what the route must
    // do.
    const forwarded = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal;
    expect(forwarded?.aborted).toBe(false);
    controller.abort();
    expect(forwarded?.aborted).toBe(true);
  });

  it('401s and never calls upstream when the access id is wrong', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      req({ messages: [], stream: true }, { accessId: 'not-a-key' }),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('503s when LLM_URL is unset, rather than sending the key to undefined/chat/completions', async () => {
    delete process.env.LLM_URL;
    const { POST } = await import('./route');
    const res = await POST(req({ messages: [], stream: true }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('503s when OPENROUTER_API_KEY is unset', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { POST } = await import('./route');
    const res = await POST(req({ messages: [], stream: true }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('502s when the upstream is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { POST } = await import('./route');
    const res = await POST(req({ messages: [], stream: true }));
    expect(res.status).toBe(502);
  });

  it('502s for an upstream error status, rather than streaming the error body back as SSE', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":"rate limited"}', { status: 429 }),
    );
    const { POST } = await import('./route');
    const res = await POST(req({ messages: [], stream: true }));
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');
    // The upstream's own status and message reach the caller — a 402 and a 429
    // read differently in the composer, which is the point of not collapsing
    // them.
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain('429');
    expect(error).toContain('rate limited');
  });

  it('withholds the upstream body on an auth failure, so a key quoted in it never reaches the client', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":"Incorrect API key provided: sk-or-test"}', {
        status: 401,
      }),
    );
    const { POST } = await import('./route');
    const res = await POST(req({ messages: [], stream: true }));
    expect(res.status).toBe(502);
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain('401');
    expect(error).not.toContain('sk-or-test');
  });
});
