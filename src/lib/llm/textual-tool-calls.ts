// Recovering tool calls a model wrote as text instead of calling.
//
// Some models intermittently emit their native tool syntax into the content
// stream rather than through the API's tool_calls channel — the same model, in
// the same session, will call correctly one turn and write this the next:
//
//   <tool_call>
//   <function=send_picture>
//   <parameter=which>504</parameter>
//   </function>
//   </tool_call>
//
// Left alone the tool never runs, the block is committed to the transcript as
// something the companion said, and a spoken turn has TTS read the markup aloud
// in their voice. So it's parsed back into a real call and cut out of the text.
//
// This is deliberately narrow: one dialect, matched on a distinctive opening
// tag. It is a repair for a provider that didn't hold up its end, not a second
// tool-calling protocol to maintain — anything it doesn't recognise is left
// exactly as it is rather than guessed at.

import type { ToolCall } from './client';

// One <tool_call> block. Non-greedy so several in a turn stay separate.
const BLOCK = /<tool_call>([\s\S]*?)<\/tool_call>/g;
const FUNCTION_NAME = /<function=([^>\s]+)>/;
const PARAMETER = /<parameter=([^>\s]+)>([\s\S]*?)<\/parameter>/g;

// The calls a model wrote out in text. Ids are synthesised — the wire format
// has none, and the caller only needs them to key results back to their call.
export function parseTextualToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const match of text.matchAll(BLOCK)) {
    const body = match[1] ?? '';
    const name = FUNCTION_NAME.exec(body)?.[1];
    // A block with no function name is malformed, not a call: skip it rather
    // than dispatch something unnamed.
    if (name === undefined) continue;
    const args: Record<string, string | number> = {};
    for (const param of body.matchAll(PARAMETER)) {
      const key = param[1];
      if (key === undefined) continue;
      const raw = (param[2] ?? '').trim();
      // The dialect is untyped — every value arrives as text — but the tools
      // are schema-typed and check what they get: send_picture's `which` is an
      // integer, and a string there silently falls back to the first picture
      // rather than failing. So recover the number the structured channel
      // would have carried. Anything not cleanly numeric stays a string.
      args[key] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    }
    calls.push({
      id: `textual-${calls.length}`,
      name,
      arguments: JSON.stringify(args),
    });
  }
  return calls;
}

// The text with those blocks removed, so neither the transcript nor TTS ever
// sees them. Collapses the blank lines a removed block leaves behind, since it
// usually sits alone between paragraphs.
export function stripTextualToolCalls(text: string): string {
  return text
    .replace(BLOCK, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
