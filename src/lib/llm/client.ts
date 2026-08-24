// The companion's LLM client: a thin wrapper over the openai SDK, pointed
// straight at the user's own provider with the user's own key (see
// companions/keys.ts). Nothing of ours sits in between — OpenRouter allows the
// browser's origin and every header the SDK sends.
import OpenAI from 'openai';
import { parseTextualToolCalls } from './textual-tool-calls';
import { readKeys } from '@/lib/companions/keys';
import {
  type ModelSettings,
  routingRequest,
} from '@/lib/companions/model-settings';
import { llmErrorMessage } from '@/lib/companions/provider-error';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoningDetails?: unknown[]; // assistant only; mapped to reasoning_details
  toolCalls?: ToolCall[]; // assistant only; the calls it made (for the reaction turn)
  toolCallId?: string; // tool only; which call this result answers
};

// promptTokens/cachedTokens are how much of the prefix the provider recognised
// from the last turn. The whole conversation is re-sent every turn, so a healthy
// cachedTokens is most of promptTokens and grows with the thread; a zero means
// something volatile got in above the conversation and every turn is paying for
// all of it. Both counts are required: every model this app has run through
// OpenRouter reports them, so a usage chunk that arrives carries them. A turn
// where none arrives at all is the separate case, and it is the caller's to
// hold — onUsage simply never fires (see stream()).
export type LlmUsage = {
  completionTokens: number;
  promptTokens: number;
  cachedTokens: number;
};

// The OpenAI-compatible request tool shape (function tools). Generic LLM wire
// shape — companions/tools.ts maps its CompanionTools onto this. `parameters`
// is a JSON-Schema object: `properties` empty for a zero-arg tool (start/stop),
// or a map of named arguments — a string, free (search_media's description) or
// constrained to an `enum` (variety's level), or a bounded integer (intensity's
// percent) — with a `required` list.
export type ToolParameterSchema = {
  type: 'object';
  properties: Record<
    string,
    | { type: 'string'; enum?: string[]; description?: string }
    | {
        type: 'integer';
        minimum?: number;
        maximum?: number;
        description?: string;
      }
  >;
  required?: string[];
};
export type RequestTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
};

// One assembled tool call surfaced at the end of a stream.
export type ToolCall = { id: string; name: string; arguments: string };

export type LlmClient = {
  // Streams assistant token deltas for a turn. Abort opts.signal to cancel the
  // whole generation (barge-in / Stop). onUsage fires once, at the end, with the
  // model's token accounting (when the backend returns it) — used for tok/s.
  // onReasoning fires once, at the end, with the assembled reasoning array —
  // only when the backend sent reasoning_details.
  stream: (
    messages: LlmMessage[],
    opts: {
      signal: AbortSignal;
      onUsage?: (usage: LlmUsage) => void;
      onReasoning?: (details: unknown[]) => void;
      tools?: RequestTool[];
      onToolCalls?: (calls: ToolCall[]) => void;
    },
  ) => AsyncIterable<string>;
};

// The openai SDK types don't model OpenRouter's reasoning_details, so we cast at
// this boundary only — a narrow local type, never `any` on the whole call.
type ReasoningEntry = { index?: number; text?: string; [k: string]: unknown };
type ToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};
type DeltaExtras = {
  reasoning_details?: ReasoningEntry[];
  tool_calls?: ToolCallDelta[];
};
type AssembledCall = ToolCall & { index: number };
type OutgoingMessage = {
  role: LlmMessage['role'];
  content: string;
  reasoning_details?: unknown[];
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

// Map our LlmMessage to the OpenAI wire shape: assistant messages can carry
// tool_calls (the reaction turn's history), and tool-role messages carry the
// result of one call keyed by tool_call_id.
function toOutgoing(m: LlmMessage): OutgoingMessage {
  if (m.role === 'tool') {
    return { role: 'tool', content: m.content, tool_call_id: m.toolCallId };
  }
  const out: OutgoingMessage = { role: m.role, content: m.content };
  if (m.role === 'assistant') {
    if (m.reasoningDetails !== undefined) {
      out.reasoning_details = m.reasoningDetails;
    }
    if (m.toolCalls !== undefined && m.toolCalls.length > 0) {
      out.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
  }
  return out;
}

// Merge streamed reasoning_details deltas into one ordered array: entries
// sharing an index are folded together, appending their text. Provider-specific
// shape ({type, text, index}) — confirmed against live MiniMax output.
function mergeReasoning(acc: ReasoningEntry[], deltas: ReasoningEntry[]): void {
  for (const d of deltas) {
    const idx = typeof d.index === 'number' ? d.index : acc.length;
    const existing = acc.find((e) => e.index === idx);
    if (existing === undefined) {
      acc.push({ ...d, index: idx });
    } else {
      const text =
        (typeof existing.text === 'string' ? existing.text : '') +
        (typeof d.text === 'string' ? d.text : '');
      Object.assign(existing, d, { index: idx, text });
    }
  }
}

// Merge streamed tool_call deltas into ordered calls: entries sharing an index
// are folded — id/name taken as they arrive, arguments concatenated.
function mergeToolCalls(acc: AssembledCall[], deltas: ToolCallDelta[]): void {
  for (const d of deltas) {
    const idx = typeof d.index === 'number' ? d.index : acc.length;
    let call = acc.find((c) => c.index === idx);
    if (call === undefined) {
      call = { index: idx, id: '', name: '', arguments: '' };
      acc.push(call);
    }
    if (typeof d.id === 'string') call.id = d.id;
    if (typeof d.function?.name === 'string') call.name = d.function.name;
    if (typeof d.function?.arguments === 'string') {
      call.arguments += d.function.arguments;
    }
  }
}

export function createLlmClient(settings: ModelSettings): LlmClient {
  const { stream: streaming } = settings;
  // The model to name and, when Settings pins one, the provider to insist on.
  // `provider` is OpenRouter's own field rather than an OpenAI one, which is why
  // it is spread in rather than typed by the SDK.
  const routing = routingRequest(settings);
  // Read once, here: a client is made per session (use-voice-session.ts), and
  // Companions is hidden until both keys are stored, so there is no case of a
  // key arriving mid-session for a request to pick up.
  const { openRouterKey, llmUrl } = readKeys();
  const client = new OpenAI({
    baseURL: llmUrl,
    apiKey: openRouterKey,
    dangerouslyAllowBrowser: true, // we intentionally run in the browser, next to the device
  });

  async function* stream(
    messages: LlmMessage[],
    opts: {
      signal: AbortSignal;
      onUsage?: (usage: LlmUsage) => void;
      onReasoning?: (details: unknown[]) => void;
      tools?: RequestTool[];
      onToolCalls?: (calls: ToolCall[]) => void;
    },
  ): AsyncIterable<string> {
    const outgoing: OutgoingMessage[] = messages.map(toOutgoing);
    const request = {
      ...routing,
      messages:
        outgoing as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      ...(opts.tools !== undefined && opts.tools.length > 0
        ? { tools: opts.tools }
        : {}),
    };
    // The request that fails is this one — a streaming call learns its status
    // before the first chunk — so the provider's refusal is explained here
    // rather than arriving at the UI as a bare number. An abort is not a
    // failure: it's how barge-in and Stop end a turn, and the caller tells them
    // apart by the signal, not by the message.
    const explain = (e: unknown): never => {
      if (opts.signal.aborted) throw e;
      throw new Error(llmErrorMessage(e, llmUrl));
    };
    const completion = streaming
      ? await client.chat.completions
          .create(
            {
              ...request,
              stream: true,
              // Ask for a final usage chunk (empty choices + usage) so we can
              // report output tok/s. Providers that don't send it simply never
              // fire onUsage.
              stream_options: { include_usage: true },
            },
            { signal: opts.signal },
          )
          .catch(explain)
      : // Not streaming: one reply, arriving whole. It is turned into a
        // single chunk of the streamed shape so everything below — reasoning,
        // tool calls, usage, the textual-call recovery — reads one way only.
        // A message's tool_calls carry no index; mergeToolCalls numbers them by
        // arrival, which is the order they came in.
        [
          await client.chat.completions
            .create({ ...request, stream: false }, { signal: opts.signal })
            .then((whole) => ({
              choices: [{ delta: whole.choices[0]?.message }],
              usage: whole.usage,
            }))
            .catch(explain),
        ];
    const reasoning: ReasoningEntry[] = [];
    const toolCalls: AssembledCall[] = [];
    // Kept so the finished text can be checked for calls the model wrote out
    // instead of making — see textual-tool-calls.ts. Deltas still stream
    // untouched; a block can span several, so it's only knowable at the end.
    let content = '';
    for await (const chunk of completion) {
      const choice = chunk.choices[0];
      const delta = choice?.delta?.content;
      if (delta) {
        content += delta;
        yield delta;
      }
      const extras = choice?.delta as DeltaExtras | undefined;
      const rd = extras?.reasoning_details;
      if (rd != null) mergeReasoning(reasoning, rd);
      const tc = extras?.tool_calls;
      if (tc != null) mergeToolCalls(toolCalls, tc);
      const usage = chunk.usage;
      if (usage != null) {
        // prompt_tokens_details is OpenAI's shape for the cached count, which is
        // what OpenRouter passes through. The floor is for the type, not for a
        // provider: a model that answered without it would read as caching
        // nothing, which the Companions debug tab shows plainly enough.
        const cached = (
          usage as { prompt_tokens_details?: { cached_tokens?: number } }
        ).prompt_tokens_details?.cached_tokens;
        opts.onUsage?.({
          completionTokens: usage.completion_tokens,
          promptTokens: usage.prompt_tokens,
          cachedTokens: cached ?? 0,
        });
      }
    }
    // Surface the assembled reasoning/tool calls once, at natural completion only
    // — an early break (barge-in / abort) calls the generator's return() and
    // skips this, so truncated data is never handed back.
    if (reasoning.length > 0) opts.onReasoning?.(reasoning);
    // A model that wrote its calls out as text made none through the API, so
    // these are additions rather than duplicates — but concatenate rather than
    // replace, in case a turn manages one of each. The parser numbers them from
    // zero every time; they are stored in the thread and every later request
    // replays it, so they are made unique here before anything sees them.
    const stamp = Date.now();
    const recovered = parseTextualToolCalls(content).map((c) => ({
      ...c,
      id: `${c.id}-${stamp}`,
    }));
    const calls = [
      ...toolCalls.map(({ index: _index, ...c }) => c),
      ...recovered,
    ];
    if (calls.length > 0) opts.onToolCalls?.(calls);
  }

  return { stream };
}
