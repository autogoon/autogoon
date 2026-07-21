// The companion conversation thread: a pure, immutable record of every user and
// assistant turn, plus the projection to the LLM request and the localStorage
// codec. No React, no I/O — the hook owns the live ref and the storage calls;
// this module is the tested logic they lean on (like session-policy.ts).
import type { LlmMessage } from "@/lib/llm/client";

export type ThreadTurn =
  | { role: "user"; content: string }
  // reasoningDetails holds OpenRouter's opaque reasoning_details, captured from
  // the stream and replayed verbatim; we never inspect its shape.
  | { role: "assistant"; content: string; reasoningDetails?: unknown[] };

export type Thread = ThreadTurn[];

// Immutable builders — return a new thread, never mutate the input.
export function appendUser(thread: Thread, content: string): Thread {
  return [...thread, { role: "user", content }];
}

export function appendAssistant(
  thread: Thread,
  content: string,
  reasoningDetails?: unknown[],
): Thread {
  const turn: ThreadTurn =
    reasoningDetails === undefined
      ? { role: "assistant", content }
      : { role: "assistant", content, reasoningDetails };
  return [...thread, turn];
}

// Build the LLM request: the system message first, then every turn. Assistant
// turns carry reasoning_details ONLY when passesReasoning is true (reasoning
// models); a non-reasoning companion never emits the field.
export function toLlmMessages(
  thread: Thread,
  systemPrompt: string,
  passesReasoning: boolean,
): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: "system", content: systemPrompt }];
  for (const turn of thread) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else if (passesReasoning && turn.reasoningDetails !== undefined) {
      messages.push({
        role: "assistant",
        content: turn.content,
        reasoningDetails: turn.reasoningDetails,
      });
    } else {
      messages.push({ role: "assistant", content: turn.content });
    }
  }
  return messages;
}

export function serialize(thread: Thread): string {
  return JSON.stringify(thread);
}

// Tolerant codec: any malformed / partial / legacy / non-array JSON → [], so a
// bad or stale localStorage value can never crash the session — it just starts
// fresh.
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
    if (typeof turn.content !== "string") return [];
    if (turn.role === "user") {
      out.push({ role: "user", content: turn.content });
    } else if (turn.role === "assistant") {
      if (turn.reasoningDetails === undefined) {
        out.push({ role: "assistant", content: turn.content });
      } else if (Array.isArray(turn.reasoningDetails)) {
        out.push({
          role: "assistant",
          content: turn.content,
          reasoningDetails: turn.reasoningDetails,
        });
      } else {
        return [];
      }
    } else {
      return [];
    }
  }
  return out;
}
