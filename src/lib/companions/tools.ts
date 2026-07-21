// The companion's device tools: the LLM analogue of the voice `Command`. A tool
// is declared by the panel (which owns the device) and dispatched by the voice
// session; this module is just the pure type + the mapping to the LLM request
// shape, so it can be unit-tested without React or the device.
import type { RequestTool, ToolParameterSchema } from "@/lib/llm/client";

export type CompanionTool = {
  name: string; // the model-facing tool name, e.g. "start" | "stop" | "intensity"
  description: string; // shown to the model so it knows when to call it
  // JSON-Schema for the tool's arguments. Omit for a zero-argument tool
  // (start/stop); supply a string-enum property (e.g. `level`) for a tool the
  // model must call WITH an argument (intensity/edge).
  parameters?: ToolParameterSchema;
  // Executes the action and returns a short result string (logged + fed back to
  // the model). `args` is the parsed tool-call arguments — `{}` for a zero-arg
  // tool, or e.g. `{ level: "warmup" }` for a parameterized one.
  run: (args: Record<string, unknown>) => string;
};

// Map declared tools to the OpenAI-compatible request `tools` array. A tool with
// no declared `parameters` becomes a function tool with an empty-object schema
// (zero-argument, as start/stop are).
export function toRequestTools(tools: CompanionTool[]): RequestTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters ?? { type: "object", properties: {} },
    },
  }));
}
