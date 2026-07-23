// The companion's device tools: the LLM analogue of the voice `Command`. A tool
// is declared by the panel (which owns the device) and dispatched by the voice
// session; this module is just the pure type + the mapping to the LLM request
// shape, so it can be unit-tested without React or the device.
import type { RequestTool, ToolParameterSchema } from "@/lib/llm/client";

// What a tool's `run` may return. A plain string is the common case (the result
// text logged + fed back to the model). The object form lets a tool also attach
// a picture to the transcript turn (send_picture): `result` is the model-facing
// text, `imageSrc` the picture to render inline in the conversation and pop into
// the lightbox.
export type ToolRunResult = { result: string; imageSrc?: string };

export type CompanionTool = {
  name: string; // the model-facing tool name, e.g. "start" | "stop" | "intensity"
  description: string; // shown to the model so it knows when to call it
  // JSON-Schema for the tool's arguments. Omit for a zero-argument tool
  // (start/stop); supply a property schema — a string-enum (`variety`'s
  // `level`) or a bounded integer (`intensity`'s `percent`) — for a tool the
  // model must call WITH an argument.
  parameters?: ToolParameterSchema;
  // Executes the action and returns a short result (logged + fed back to the
  // model). Usually just the result string; a tool that also produces a picture
  // returns a ToolRunResult. `args` is the parsed tool-call arguments — `{}` for
  // a zero-arg tool, or e.g. `{ percent: 40 }` for a parameterized one.
  run: (args: Record<string, unknown>) => string | ToolRunResult;
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
