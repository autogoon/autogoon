// What createLlmClient puts on the wire (messages, model, tools, access header)
// and what it hands back from a stream (tokens, reasoning, tool calls, usage).
// The dialect of a tool call written out as text is decided in
// textual-tool-calls.test.ts; here only the wiring to it is pinned.
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ACCESS_HEADER } from '@/lib/companions/access';

type ReasoningDelta = { index?: number; type?: string; text?: string };
type ToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};
type Delta = {
  content?: string;
  reasoning_details?: ReasoningDelta[];
  tool_calls?: ToolCallDelta[];
};
type Chunk = {
  choices: { delta: Delta }[];
  usage?: { completion_tokens: number };
};
const createMock =
  jest.fn<(...args: unknown[]) => Promise<AsyncIterable<Chunk>>>();

jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

// getAccessId (companions/access.ts) reads localStorage, which the node test
// environment does not have, so without a stand-in the access header can only
// ever carry ''. Only getItem is called; the cast supplies the rest of Storage.
let storedAccessId = '';
globalThis.localStorage = {
  getItem: () => storedAccessId,
} as unknown as Storage;

// A fake of the SDK's streamed response: an async iterable of chat-completion
// chunks. An `undefined` entry is emitted as a delta with no content key at all,
// which the client skips (client.ts:204).
function fakeStream(deltas: (string | undefined)[]): AsyncIterable<Chunk> {
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

// The same fake over whole deltas, for the reasoning / tool-call channels. Token
// accounting arrives on the wire as a final chunk of its own carrying no
// choices, so `usage` is appended that way rather than onto the last delta.
function fakeDeltaStream(
  deltas: Delta[],
  usage?: { completion_tokens: number },
): AsyncIterable<Chunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of deltas) yield { choices: [{ delta }] };
      if (usage !== undefined) yield { choices: [], usage };
    },
  };
}

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const t of it) out.push(t);
  return out;
}

describe('createLlmClient', () => {
  beforeEach(() => {
    createMock.mockReset();
    storedAccessId = '';
  });

  it('yields each content delta as its own token', async () => {
    createMock.mockResolvedValue(fakeStream(['Hi', ' there', '!']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const tokens = await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
      }),
    );
    expect(tokens).toEqual(['Hi', ' there', '!']);
  });

  it('skips chunks whose delta carries no content', async () => {
    createMock.mockResolvedValue(fakeStream(['Hi', undefined, ' there']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const tokens = await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
      }),
    );
    expect(tokens).toEqual(['Hi', ' there']);
  });

  it('skips a delta whose content is the empty string', async () => {
    createMock.mockResolvedValue(fakeStream(['Hi', '', ' there']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const tokens = await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
      }),
    );
    expect(tokens).toEqual(['Hi', ' there']);
  });

  it('sends the conversation as the request messages', async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
      }),
    );
    const [params] = createMock.mock.calls[0] as [
      { messages: unknown; stream: boolean },
    ];
    expect(params.stream).toBe(true);
    expect(params.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('sends the model it was created with', async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
      }),
    );
    const [params] = createMock.mock.calls[0] as [{ model: string }];
    expect(params.model).toBe('test-model');
  });

  it("passes the caller's AbortSignal to the SDK request", async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const signal = new AbortController().signal;
    await collect(client.stream([{ role: 'user', content: 'hi' }], { signal }));
    const [, options] = createMock.mock.calls[0] as [
      unknown,
      { signal: AbortSignal },
    ];
    expect(options.signal).toBe(signal);
  });

  it('sends the saved Companion access ID in the ACCESS_HEADER', async () => {
    storedAccessId = 'let-me-in';
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
      }),
    );
    const [, options] = createMock.mock.calls[0] as [
      unknown,
      { headers: Record<string, string> },
    ];
    expect(options.headers).toEqual({ [ACCESS_HEADER]: 'let-me-in' });
  });

  it('asks for the final usage chunk with stream_options.include_usage', async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
      }),
    );
    const [params] = createMock.mock.calls[0] as [{ stream_options: unknown }];
    expect(params.stream_options).toEqual({ include_usage: true });
  });

  it("fires onUsage once with the usage chunk's completion_tokens", async () => {
    createMock.mockResolvedValue(
      fakeDeltaStream([{ content: 'ok' }], { completion_tokens: 42 }),
    );
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const seen: unknown[] = [];
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        onUsage: (u) => seen.push(u),
      }),
    );
    expect(seen).toEqual([{ completionTokens: 42 }]);
  });

  it('never fires onUsage for a stream that ends without a usage chunk', async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const onUsage = jest.fn();
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        onUsage,
      }),
    );
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('fires onReasoning once with reasoning_details merged by index', async () => {
    createMock.mockResolvedValue(
      fakeDeltaStream([
        {
          reasoning_details: [
            { index: 0, type: 'reasoning.text', text: 'Let me' },
            { index: 1, type: 'reasoning.text', text: 'Also' },
          ],
        },
        { reasoning_details: [{ index: 1, text: ' that' }] },
        { reasoning_details: [{ index: 0, text: ' think' }] },
        { content: 'Answer' },
      ]),
    );
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const seen: unknown[][] = [];
    const tokens = await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        onReasoning: (d) => seen.push(d),
      }),
    );
    expect(tokens).toEqual(['Answer']);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([
      { index: 0, type: 'reasoning.text', text: 'Let me think' },
      { index: 1, type: 'reasoning.text', text: 'Also that' },
    ]);
  });

  it('appends a reasoning delta that arrives with no index as a new entry', async () => {
    createMock.mockResolvedValue(
      fakeDeltaStream([
        { reasoning_details: [{ index: 0, text: 'first' }] },
        { reasoning_details: [{ text: 'second' }] },
        { content: 'Answer' },
      ]),
    );
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const seen: unknown[][] = [];
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        onReasoning: (d) => seen.push(d),
      }),
    );
    expect(seen[0]).toEqual([
      { index: 0, text: 'first' },
      { index: 1, text: 'second' },
    ]);
  });

  it('never fires onReasoning for a content-only stream', async () => {
    createMock.mockResolvedValue(fakeStream(['Hi', ' there']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const onReasoning = jest.fn();
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        onReasoning,
      }),
    );
    expect(onReasoning).not.toHaveBeenCalled();
  });

  it('does not fire onReasoning when the consumer breaks early', async () => {
    createMock.mockResolvedValue(
      fakeDeltaStream([
        { reasoning_details: [{ index: 0, text: 'partial' }] },
        { content: 'a' },
        { content: 'b' },
      ]),
    );
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const onReasoning = jest.fn();
    for await (const token of client.stream([{ role: 'user', content: 'hi' }], {
      signal: new AbortController().signal,
      onReasoning,
    })) {
      void token;
      break;
    }
    expect(onReasoning).not.toHaveBeenCalled();
  });

  it("maps a message's reasoningDetails to reasoning_details on the wire", async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    await collect(
      client.stream(
        [
          { role: 'user', content: 'hi' },
          {
            role: 'assistant',
            content: 'prev',
            reasoningDetails: [{ index: 0, text: 'x' }],
          },
        ],
        { signal: new AbortController().signal },
      ),
    );
    const [params] = createMock.mock.calls[0] as [{ messages: unknown[] }];
    expect(params.messages).toEqual([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'prev',
        reasoning_details: [{ index: 0, text: 'x' }],
      },
    ]);
  });

  it("maps an assistant message's toolCalls to tool_calls with type function", async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    await collect(
      client.stream(
        [
          { role: 'user', content: 'start it' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call_1', name: 'start', arguments: '{}' }],
          },
        ],
        { signal: new AbortController().signal },
      ),
    );
    const [params] = createMock.mock.calls[0] as [{ messages: unknown[] }];
    expect(params.messages).toEqual([
      { role: 'user', content: 'start it' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'start', arguments: '{}' },
          },
        ],
      },
    ]);
  });

  it('omits tool_calls for an assistant message whose toolCalls array is empty', async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    await collect(
      client.stream([{ role: 'assistant', content: 'said', toolCalls: [] }], {
        signal: new AbortController().signal,
      }),
    );
    const [params] = createMock.mock.calls[0] as [{ messages: unknown[] }];
    expect(params.messages).toEqual([{ role: 'assistant', content: 'said' }]);
  });

  it("maps a tool message's toolCallId to tool_call_id", async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    await collect(
      client.stream(
        [{ role: 'tool', content: 'started', toolCallId: 'call_1' }],
        {
          signal: new AbortController().signal,
        },
      ),
    );
    const [params] = createMock.mock.calls[0] as [{ messages: unknown[] }];
    expect(params.messages).toEqual([
      { role: 'tool', content: 'started', tool_call_id: 'call_1' },
    ]);
  });

  it('fires onToolCalls once with tool_calls merged by index', async () => {
    createMock.mockResolvedValue(
      fakeDeltaStream([
        {
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              function: { name: 'set_intensity', arguments: '{"percent":' },
            },
            {
              index: 1,
              id: 'call_2',
              function: { name: 'stop', arguments: '{}' },
            },
          ],
        },
        { tool_calls: [{ index: 0, function: { arguments: '40}' } }] },
        { content: 'ok' },
      ]),
    );
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const seen: unknown[][] = [];
    const tokens = await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        onToolCalls: (c) => seen.push(c),
      }),
    );
    expect(tokens).toEqual(['ok']);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([
      { id: 'call_1', name: 'set_intensity', arguments: '{"percent":40}' },
      { id: 'call_2', name: 'stop', arguments: '{}' },
    ]);
  });

  it('appends a tool-call delta that arrives with no index as a new call', async () => {
    createMock.mockResolvedValue(
      fakeDeltaStream([
        {
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              function: { name: 'start', arguments: '{}' },
            },
          ],
        },
        {
          tool_calls: [
            { id: 'call_2', function: { name: 'stop', arguments: '{}' } },
          ],
        },
        { content: 'ok' },
      ]),
    );
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const seen: unknown[][] = [];
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        onToolCalls: (c) => seen.push(c),
      }),
    );
    expect(seen[0]).toEqual([
      { id: 'call_1', name: 'start', arguments: '{}' },
      { id: 'call_2', name: 'stop', arguments: '{}' },
    ]);
  });

  it('never fires onToolCalls for a stream with no tool calls', async () => {
    createMock.mockResolvedValue(fakeStream(['Hi', ' there']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const onToolCalls = jest.fn();
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        onToolCalls,
      }),
    );
    expect(onToolCalls).not.toHaveBeenCalled();
  });

  it('does not fire onToolCalls when the consumer breaks early', async () => {
    createMock.mockResolvedValue(
      fakeDeltaStream([
        {
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              function: { name: 'start', arguments: '' },
            },
          ],
        },
        { content: 'a' },
        { content: 'b' },
      ]),
    );
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const onToolCalls = jest.fn();
    for await (const token of client.stream([{ role: 'user', content: 'hi' }], {
      signal: new AbortController().signal,
      onToolCalls,
    })) {
      void token;
      break;
    }
    expect(onToolCalls).not.toHaveBeenCalled();
  });

  it('recovers a tool call the model wrote as text across several content deltas', async () => {
    const deltas = [
      '<tool_call>\n<function=send_media>\n',
      '<parameter=which>504</parameter>\n</function>\n</tool_call>',
    ];
    createMock.mockResolvedValue(fakeStream(deltas));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const seen: unknown[][] = [];
    const tokens = await collect(
      client.stream([{ role: 'user', content: 'show me' }], {
        signal: new AbortController().signal,
        onToolCalls: (c) => seen.push(c),
      }),
    );
    expect(tokens).toEqual(deltas);
    expect(seen[0]).toEqual([
      { id: 'textual-0', name: 'send_media', arguments: '{"which":504}' },
    ]);
  });

  it('appends a text-written tool call after the ones made through the API', async () => {
    createMock.mockResolvedValue(
      fakeDeltaStream([
        {
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              function: { name: 'start', arguments: '{}' },
            },
          ],
        },
        {
          content:
            '<tool_call>\n<function=send_media>\n<parameter=which>504</parameter>\n</function>\n</tool_call>',
        },
      ]),
    );
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const seen: unknown[][] = [];
    await collect(
      client.stream([{ role: 'user', content: 'start and show me' }], {
        signal: new AbortController().signal,
        onToolCalls: (c) => seen.push(c),
      }),
    );
    expect(seen[0]).toEqual([
      { id: 'call_1', name: 'start', arguments: '{}' },
      { id: 'textual-0', name: 'send_media', arguments: '{"which":504}' },
    ]);
  });

  it('forwards the given tools on the request', async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'start',
          description: 'Start.',
          parameters: { type: 'object' as const, properties: {} },
        },
      },
    ];
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        tools,
      }),
    );
    const [params] = createMock.mock.calls[0] as [{ tools?: unknown }];
    expect(params.tools).toEqual(tools);
  });

  it('omits the tools field entirely for an empty tools array', async () => {
    createMock.mockResolvedValue(fakeStream(['ok']));
    const { createLlmClient } = await import('./client');
    const client = createLlmClient('test-model');
    await collect(
      client.stream([{ role: 'user', content: 'hi' }], {
        signal: new AbortController().signal,
        tools: [],
      }),
    );
    const [params] = createMock.mock.calls[0] as [Record<string, unknown>];
    expect('tools' in params).toBe(false);
  });
});
