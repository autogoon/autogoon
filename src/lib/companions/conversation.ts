// The companion conversation thread: a pure, immutable record of every user and
// assistant turn, plus the projection to the LLM request and the localStorage
// codec. No React, no I/O — the hook owns the live ref and the storage calls;
// this module is the tested logic they lean on (like session-policy.ts).
import type { LlmMessage, ToolCall } from '@/lib/llm/client';

// Every variant carries an optional `at` (epoch ms, stamped on append) — the
// basis for the transcript's timestamps/date headers and the projection's gap
// markers. Optional because threads stored before timestamps existed have none:
// those turns stay valid, they just can't anchor a gap or a timestamp.
export type ThreadTurn =
  | { role: 'user'; content: string; at?: number }
  // reasoningDetails holds OpenRouter's opaque reasoning_details, captured from
  // the stream and replayed verbatim; we never inspect its shape. toolCalls is
  // set on the turn where the companion called a tool — its content is usually
  // empty, the calls are the payload.
  | {
      role: 'assistant';
      content: string;
      reasoningDetails?: unknown[];
      toolCalls?: ToolCall[];
      at?: number;
    }
  // A tool result, linked to the assistant tool-call turn before it by
  // toolCallId. name is display-only (the transcript chip); result is what we
  // feed back to the model, and the chip text too unless display says
  // otherwise. These ARE replayed to the LLM (see toLlmMessages) so the
  // companion sees their own prior tool use. mediaRef is set only for a
  // media-sending tool (send_media): it's the still or video the transcript
  // renders inline and the lightbox opens. display is set only where the
  // result is too long to read on screen (search_media's every match). Both are
  // display-only — never sent to the model (only `result` is) — and persist
  // with the thread, so the log reads the same across a reload.
  | {
      role: 'tool';
      name: string;
      result: string;
      toolCallId: string;
      mediaRef?: string;
      display?: string;
      at?: number;
    };

export type Thread = ThreadTurn[];

// Immutable builders — return a new thread, never mutate the input. `at` is
// the turn's timestamp (epoch ms); callers pass Date.now() at commit time.
export function appendUser(
  thread: Thread,
  content: string,
  at?: number,
): Thread {
  return [
    ...thread,
    { role: 'user', content, ...(at !== undefined ? { at } : {}) },
  ];
}

export function appendTool(
  thread: Thread,
  name: string,
  result: string,
  toolCallId: string,
  mediaRef?: string,
  display?: string,
  at?: number,
): Thread {
  return [
    ...thread,
    {
      role: 'tool',
      name,
      result,
      toolCallId,
      ...(mediaRef !== undefined ? { mediaRef } : {}),
      ...(display !== undefined ? { display } : {}),
      ...(at !== undefined ? { at } : {}),
    },
  ];
}

export function appendAssistant(
  thread: Thread,
  content: string,
  reasoningDetails?: unknown[],
  toolCalls?: ToolCall[],
  at?: number,
): Thread {
  return [
    ...thread,
    {
      role: 'assistant',
      content,
      ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
      ...(toolCalls !== undefined ? { toolCalls } : {}),
      ...(at !== undefined ? { at } : {}),
    },
  ];
}

// Only a break longer than this earns a gap marker in the projection — short
// pauses are just conversation, not the user going away.
export const GAP_MARKER_MIN_MS = 15 * 60_000;

// A gap, spoken as a stage direction: "20 minutes pass." / "1 hour passes." /
// "3 days pass." Coarse on purpose — the model needs the scale, not precision.
export function describeGap(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minutes pass.`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24)
    return hours === 1 ? '1 hour passes.' : `${hours} hours pass.`;
  const days = Math.round(ms / 86_400_000);
  return days === 1 ? '1 day passes.' : `${days} days pass.`;
}

// A local timestamp for the prompt: "Thursday 23 July 2026, 2:05 pm". The name
// parts come from Intl (en-GB — the prompt speaks English regardless of the
// user's locale); the assembly stays manual so the overall shape can't drift
// with the ICU version's combined-format separators.
export function describeClock(at: number): string {
  const d = new Date(at);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  const hour12 = ((d.getHours() + 11) % 12) + 1;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'am' : 'pm';
  return `${weekday} ${d.getDate()} ${month} ${d.getFullYear()}, ${hour12}:${minutes} ${ampm}`;
}

// An assistant turn with no spoken text — the model called a tool (send_media,
// say) without saying anything. The transcript renders no bubble for these; the
// tool chip or media that follows is the visible record.
export function isSilentAssistantTurn(turn: ThreadTurn): boolean {
  return turn.role === 'assistant' && turn.content.trim() === '';
}

// Whether two timestamps fall on the same local calendar day — the transcript's
// date headers sit wherever this flips.
export function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

// Build the LLM request: the system message first, then every turn. Assistant
// turns carry reasoning_details ONLY when passesReasoning is true (reasoning
// models); a non-reasoning companion never emits the field. Assistant tool-call
// turns and the tool results that answer them are replayed as a valid agentic
// sequence — this is what keeps the companion calling tools instead of narrating
// them: they see they have actually called them before.
//
// Time awareness: when both sides of a gap are stamped and the gap clears
// GAP_MARKER_MIN_MS, a system stage direction — "(2 hours pass.)" — is inserted
// so the companion knows the user went away. Only before user turns: a marker
// can never split
// an assistant tool-call from its result, and a gap only ever means the user
// stepped away. The stored thread is untouched; markers exist per-request.
export function toLlmMessages(
  thread: Thread,
  systemPrompt: string,
  passesReasoning: boolean,
): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: 'system', content: systemPrompt }];
  let prev: ThreadTurn | undefined;
  for (const turn of thread) {
    if (turn.role === 'user') {
      if (
        prev?.at !== undefined &&
        turn.at !== undefined &&
        turn.at - prev.at >= GAP_MARKER_MIN_MS
      ) {
        messages.push({
          role: 'system',
          content: `(${describeGap(turn.at - prev.at)})`,
        });
      }
      messages.push({ role: 'user', content: turn.content });
    } else if (turn.role === 'assistant') {
      const msg: LlmMessage = { role: 'assistant', content: turn.content };
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
        role: 'tool',
        content: turn.result,
        toolCallId: turn.toolCallId,
      });
    }
    prev = turn;
  }
  return messages;
}

export function serialize(thread: Thread): string {
  return JSON.stringify(thread);
}

// Tolerant codec: any malformed / partial / legacy / non-array JSON → [], so a
// bad or stale localStorage value can never crash the session — it just starts
// fresh. Legacy tool turns without a toolCallId are treated as malformed, which
// discards pre-agentic threads wholesale (they can't be replayed validly).
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
    if (item === null || typeof item !== 'object') return [];
    const turn = item as Record<string, unknown>;
    if (turn.at !== undefined && typeof turn.at !== 'number') return [];
    const at = turn.at as number | undefined;
    if (turn.role === 'user') {
      if (typeof turn.content !== 'string') return [];
      out.push({
        role: 'user',
        content: turn.content,
        ...(at !== undefined ? { at } : {}),
      });
    } else if (turn.role === 'assistant') {
      if (typeof turn.content !== 'string') return [];
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
        role: 'assistant',
        content: turn.content,
        ...(turn.reasoningDetails !== undefined
          ? { reasoningDetails: turn.reasoningDetails }
          : {}),
        ...(turn.toolCalls !== undefined
          ? { toolCalls: turn.toolCalls as ToolCall[] }
          : {}),
        ...(at !== undefined ? { at } : {}),
      });
    } else if (turn.role === 'tool') {
      if (
        typeof turn.name !== 'string' ||
        typeof turn.result !== 'string' ||
        typeof turn.toolCallId !== 'string'
      ) {
        return [];
      }
      if (turn.mediaRef !== undefined && typeof turn.mediaRef !== 'string') {
        return [];
      }
      if (turn.display !== undefined && typeof turn.display !== 'string') {
        return [];
      }
      out.push({
        role: 'tool',
        name: turn.name,
        result: turn.result,
        toolCallId: turn.toolCallId,
        ...(turn.mediaRef !== undefined ? { mediaRef: turn.mediaRef } : {}),
        ...(turn.display !== undefined ? { display: turn.display } : {}),
        ...(at !== undefined ? { at } : {}),
      });
    } else {
      return [];
    }
  }
  return out;
}
