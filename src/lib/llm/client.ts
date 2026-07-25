// The companion's LLM client: a thin wrapper over the openai SDK pointed at our
// same-origin proxy route (Task 1), which forwards to OpenRouter. The client now
// sends the companion's model itself; the route injects only the API key
// server-side, and the proxy is unauthenticated for the local experiment.
// openai-node needs an ABSOLUTE baseURL — see createLlmClient for how that's built.
import OpenAI from 'openai';
import { parseTextualToolCalls } from './textual-tool-calls';
import { ACCESS_HEADER, getAccessId } from '@/lib/companions/access';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoningDetails?: unknown[]; // assistant only; mapped to reasoning_details
  toolCalls?: ToolCall[]; // assistant only; the calls it made (for the reaction turn)
  toolCallId?: string; // tool only; which call this result answers
};

export type LlmUsage = { completionTokens: number };

// The OpenAI-compatible request tool shape (function tools). Generic LLM wire
// shape — companions/tools.ts maps its CompanionTools onto this. `parameters`
// is a JSON-Schema object: `properties` empty for a zero-arg tool (start/stop),
// or a map of named arguments — a string-enum (variety) or a bounded integer
// (intensity's percent) — with a `required` list.
export type ToolParameterSchema = {
  type: 'object';
  properties: Record<
    string,
    | { type: 'string'; enum: string[]; description?: string }
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

export function createLlmClient(model: string): LlmClient {
  // openai-node needs an ABSOLUTE baseURL. In the browser — the only place this
  // client actually runs — that's the page origin; the fallback just keeps it
  // constructable under the node test env, where the SDK call is mocked.
  const baseURL =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/llm`
      : 'http://localhost/api/llm';
  const client = new OpenAI({
    baseURL,
    apiKey: 'unused', // proxy is unauthenticated locally; not a real secret
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
    const completion = await client.chat.completions.create(
      {
        model,
        messages:
          outgoing as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        stream: true,
        // Ask for a final usage chunk (empty choices + usage) so we can report
        // output tok/s. Providers that don't send it simply never fire onUsage.
        stream_options: { include_usage: true },
        ...(opts.tools !== undefined && opts.tools.length > 0
          ? { tools: opts.tools }
          : {}),
      },
      // Attach the Companion access ID (read fresh so a later unlock applies) —
      // ignored by the proxy unless COMPANIONS_ACCESS_IDS is set.
      { signal: opts.signal, headers: { [ACCESS_HEADER]: getAccessId() } },
    );
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
        opts.onUsage?.({ completionTokens: usage.completion_tokens });
      }
    }
    // Surface the assembled reasoning/tool calls once, at natural completion only
    // — an early break (barge-in / abort) calls the generator's return() and
    // skips this, so truncated data is never handed back.
    if (reasoning.length > 0) opts.onReasoning?.(reasoning);
    // A model that wrote its calls out as text made none through the API, so
    // these are additions rather than duplicates — but concatenate rather than
    // replace, in case a turn manages one of each.
    const recovered = parseTextualToolCalls(content);
    const calls = [
      ...toolCalls.map(({ index: _index, ...c }) => c),
      ...recovered,
    ];
    if (calls.length > 0) opts.onToolCalls?.(calls);
  }

  return { stream };
}
