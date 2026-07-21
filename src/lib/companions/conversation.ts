// The companion conversation thread: a pure, immutable record of every user and
// assistant turn, plus the projection to the LLM request and the localStorage
// codec. No React, no I/O — the hook owns the live ref and the storage calls;
// this module is the tested logic they lean on (like session-policy.ts).
import type { LlmMessage, ToolCall } from "@/lib/llm/client";

export type ThreadTurn =
  | { role: "user"; content: string }
  // reasoningDetails holds OpenRouter's opaque reasoning_details, captured from
  // the stream and replayed verbatim; we never inspect its shape. toolCalls is
  // set on the turn where she called a tool (start/stop) — its content is
  // usually empty, the calls are the payload.
  | {
      role: "assistant";
      content: string;
      reasoningDetails?: unknown[];
      toolCalls?: ToolCall[];
    }
  // A tool result, linked to the assistant tool-call turn before it by
  // toolCallId. name is display-only (the transcript chip); result is both the
  // chip text and what we feed back to the model. Unlike before, these ARE
  // replayed to the LLM (see toLlmMessages) so she sees her own prior tool use.
  | { role: "tool"; name: string; result: string; toolCallId: string };

export type Thread = ThreadTurn[];

// Immutable builders — return a new thread, never mutate the input.
export function appendUser(thread: Thread, content: string): Thread {
  return [...thread, { role: "user", content }];
}

export function appendTool(
  thread: Thread,
  name: string,
  result: string,
  toolCallId: string,
): Thread {
  return [...thread, { role: "tool", name, result, toolCallId }];
}

export function appendAssistant(
  thread: Thread,
  content: string,
  reasoningDetails?: unknown[],
  toolCalls?: ToolCall[],
): Thread {
  return [
    ...thread,
    {
      role: "assistant",
      content,
      ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
      ...(toolCalls !== undefined ? { toolCalls } : {}),
    },
  ];
}

// Build the LLM request: the system message first, then every turn. Assistant
// turns carry reasoning_details ONLY when passesReasoning is true (reasoning
// models); a non-reasoning companion never emits the field. Assistant tool-call
// turns and the tool results that answer them are replayed as a valid agentic
// sequence — this is what keeps her calling tools instead of narrating them:
// she sees she has actually called them before.
export function toLlmMessages(
  thread: Thread,
  systemPrompt: string,
  passesReasoning: boolean,
): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: "system", content: systemPrompt }];
  for (const turn of thread) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else if (turn.role === "assistant") {
      const msg: LlmMessage = { role: "assistant", content: turn.content };
      if (passesReasoning && turn.reasoningDetails !== undefined) {
        msg.reasoningDetails = turn.reasoningDetails;
      }
      if (turn.toolCalls !== undefined) {
        msg.toolCalls = turn.toolCalls;
      }
      messages.push(msg);
    } else {
      // role: "tool" — the result, keyed back to the call that produced it.
      messages.push({
        role: "tool",
        content: turn.result,
        toolCallId: turn.toolCallId,
      });
    }
  }
  return messages;
}

export function serialize(thread: Thread): string {
  return JSON.stringify(thread);
}

// Tolerant codec: any malformed / partial / legacy / non-array JSON → [], so a
// bad or stale localStorage value can never crash the session — it just starts
// fresh. Legacy tool turns without a toolCallId are treated as malformed, which
// discards pre-agentic threads wholesale (they can't be replayed validly) — a
// clean reset, not a crash.
export function parse(raw: string | null): Thread {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Thread = [];
  for (const item of data) {
    if (item === null || typeof item !== "object") return [];
    const turn = item as Record<string, unknown>;
    if (turn.role === "user") {
      if (typeof turn.content !== "string") return [];
      out.push({ role: "user", content: turn.content });
    } else if (turn.role === "assistant") {
      if (typeof turn.content !== "string") return [];
      if (
        turn.reasoningDetails !== undefined &&
        !Array.isArray(turn.reasoningDetails)
      ) {
        return [];
      }
      if (turn.toolCalls !== undefined && !Array.isArray(turn.toolCalls)) {
        return [];
      }
      out.push({
        role: "assistant",
        content: turn.content,
        ...(turn.reasoningDetails !== undefined
          ? { reasoningDetails: turn.reasoningDetails }
          : {}),
        ...(turn.toolCalls !== undefined
          ? { toolCalls: turn.toolCalls as ToolCall[] }
          : {}),
      });
    } else if (turn.role === "tool") {
      if (
        typeof turn.name !== "string" ||
        typeof turn.result !== "string" ||
        typeof turn.toolCallId !== "string"
      ) {
        return [];
      }
      out.push({
        role: "tool",
        name: turn.name,
        result: turn.result,
        toolCallId: turn.toolCallId,
      });
    } else {
      return [];
    }
  }
  return out;
}
