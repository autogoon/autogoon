import { describe, it, expect } from '@jest/globals';
import {
  parseTextualToolCalls,
  stripTextualToolCalls,
} from './textual-tool-calls';

// A live turn's shape: the model narrated, then wrote the call out instead of
// making it. The picture never arrived and the markup was committed as speech.
const OBSERVED = `Don't move. Not yet.

<tool_call>
<function=send_media>
<parameter=which>504</parameter>
</function>
</tool_call>`;

describe('parseTextualToolCalls', () => {
  it('recovers the call a model wrote out as text', () => {
    expect(parseTextualToolCalls(OBSERVED)).toEqual([
      {
        id: 'textual-0',
        name: 'send_media',
        // 504, not "504": send_media's run() silently sends items[0] for a
        // non-number (companions-panel/index.tsx).
        arguments: JSON.stringify({ which: 504 }),
      },
    ]);
  });

  it('recovers the number from a parameter written on its own line, which as text would send the first item', () => {
    const calls = parseTextualToolCalls(
      '<tool_call>\n<function=send_media>\n<parameter=which>\n2\n</parameter>\n</function>\n</tool_call>',
    );
    expect(calls[0]!.arguments).toBe(JSON.stringify({ which: 2 }));
  });

  it('reads both parameters of a block, since send_media checks kind against which', () => {
    const calls = parseTextualToolCalls(
      '<tool_call><function=send_media>' +
        '<parameter=which>2</parameter><parameter=kind>picture</parameter>' +
        '</function></tool_call>',
    );
    expect(calls[0]!.arguments).toBe(
      JSON.stringify({ which: 2, kind: 'picture' }),
    );
  });

  it("keeps several blocks in a turn separate, with each block's parameters on its own call", () => {
    const calls = parseTextualToolCalls(
      '<tool_call><function=stop></function></tool_call>' +
        '<tool_call><function=intensity><parameter=percent>40</parameter></function></tool_call>',
    );
    expect(calls.map((c) => c.name)).toEqual(['stop', 'intensity']);
    expect(calls[0]!.arguments).toBe('{}');
    expect(calls[1]!.arguments).toBe(JSON.stringify({ percent: 40 }));
  });

  it('gives each recovered call in a turn its own id', () => {
    const calls = parseTextualToolCalls(
      '<tool_call><function=stop></function></tool_call>' +
        '<tool_call><function=intensity><parameter=percent>40</parameter></function></tool_call>',
    );
    // Distinct ids, so results key back to the right call.
    expect(calls.map((c) => c.id)).toEqual(['textual-0', 'textual-1']);
  });

  it('gives a call with no parameters empty JSON arguments', () => {
    const calls = parseTextualToolCalls(
      '<tool_call>\n<function=stop>\n</function>\n</tool_call>',
    );
    expect(calls).toEqual([{ id: 'textual-0', name: 'stop', arguments: '{}' }]);
  });

  it('finds nothing in prose that has no tool_call block', () => {
    expect(parseTextualToolCalls('I lean back. <not a tool call>')).toEqual([]);
  });

  it('finds nothing in an empty string', () => {
    expect(parseTextualToolCalls('')).toEqual([]);
  });

  it('keeps a non-numeric value as text', () => {
    const calls = parseTextualToolCalls(
      '<tool_call><function=variety><parameter=level>medium</parameter></function></tool_call>',
    );
    expect(calls[0]!.arguments).toBe(JSON.stringify({ level: 'medium' }));
    expect(
      parseTextualToolCalls(
        '<tool_call><function=send_media><parameter=which>2 (the red one)</parameter></function></tool_call>',
      )[0]!.arguments,
    ).toBe(JSON.stringify({ which: '2 (the red one)' }));
  });

  it('skips a block with no function name rather than dispatching it', () => {
    expect(
      parseTextualToolCalls(
        '<tool_call><parameter=x>1</parameter></tool_call>',
      ),
    ).toEqual([]);
  });
});

describe('stripTextualToolCalls', () => {
  it('removes a trailing tool_call block and the blank lines before it', () => {
    expect(stripTextualToolCalls(OBSERVED)).toBe("Don't move. Not yet.");
  });

  it('closes the gap a removed block leaves mid-message', () => {
    expect(
      stripTextualToolCalls(
        'Before.\n\n<tool_call><function=stop></function></tool_call>\n\nAfter.',
      ),
    ).toBe('Before.\n\nAfter.');
  });

  it('leaves prose with a blank line and stray angle brackets untouched', () => {
    const said = 'I lean back.\n\n<not a tool call> and nothing to strip.';
    expect(stripTextualToolCalls(said)).toBe(said);
  });

  // A turn that was nothing but the block leaves nothing to say — the
  // transcript renders no bubble for it (isSilentAssistantTurn in
  // conversation.ts).
  it('empties a turn that was only a call', () => {
    expect(
      stripTextualToolCalls(
        '<tool_call><function=stop></function></tool_call>',
      ),
    ).toBe('');
  });
});
