// The companion's device tools: the LLM analogue of the voice `Command`. A tool
// is declared by the panel (which owns the device) and dispatched by the voice
// session; this module is just the pure type + the mapping to the LLM request
// shape, so it can be unit-tested without React or the device.
import type { RequestTool } from "@/lib/llm/client";

export type CompanionTool = {
  name: string; // the model-facing tool name, e.g. "start" | "stop"
  description: string; // shown to the model so it knows when to call it
  run: () => string; // executes the action; returns a short result string (logged)
};

// Map declared tools to the OpenAI-compatible request `tools` array. Start/stop
// take no arguments, so each becomes a function tool with an empty-object schema.
export function toRequestTools(tools: CompanionTool[]): RequestTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: "object", properties: {} },
    },
  }));
}
