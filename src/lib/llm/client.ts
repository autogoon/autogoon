// The companion's LLM client: a thin wrapper over the openai SDK pointed at our
// same-origin proxy route (Task 1), which forwards to Ollama and injects the real
// model server-side. So the SDK's model/apiKey here are placeholders: the route
// overrides the model, and the proxy is unauthenticated for the local experiment.
// openai-node needs an ABSOLUTE baseURL — see createLlmClient for how that's built.
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
    apiKey: "unused", // proxy is unauthenticated locally; not a real secret
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
