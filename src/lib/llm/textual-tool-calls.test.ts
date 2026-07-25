import { describe, it, expect } from '@jest/globals';
import {
  parseTextualToolCalls,
  stripTextualToolCalls,
} from './textual-tool-calls';

// Verbatim from a live turn: she narrated, then wrote the call out instead of
// making it. The picture never arrived and the markup was committed as speech.
const OBSERVED = `Don't move. Not yet.

<tool_call>
<function=send_picture>
<parameter=which>504</parameter>
</function>
</tool_call>`;

describe('parseTextualToolCalls', () => {
  it('recovers the call a model wrote out as text', () => {
    expect(parseTextualToolCalls(OBSERVED)).toEqual([
      {
        id: 'textual-0',
        name: 'send_picture',
        // A number, not "504": the tools are schema-typed and check what they
        // get — send_picture falls back to the first picture on a string, so a
        // string here would silently send the wrong one.
        arguments: JSON.stringify({ which: 504 }),
      },
    ]);
  });

  it('keeps several blocks in a turn separate', () => {
    const calls = parseTextualToolCalls(
      '<tool_call><function=stop></function></tool_call>' +
        '<tool_call><function=intensity><parameter=percent>40</parameter></function></tool_call>',
    );
    expect(calls.map((c) => c.name)).toEqual(['stop', 'intensity']);
    expect(calls[1]!.arguments).toBe(JSON.stringify({ percent: 40 }));
    // Distinct ids, so results key back to the right call.
    expect(calls[0]!.id).not.toBe(calls[1]!.id);
  });

  it('handles a zero-argument call', () => {
    const calls = parseTextualToolCalls(
      '<tool_call>\n<function=stop>\n</function>\n</tool_call>',
    );
    expect(calls).toEqual([{ id: 'textual-0', name: 'stop', arguments: '{}' }]);
  });

  // Anything unrecognised is left alone rather than guessed at — this is a
  // repair for one dialect, not a parser for arbitrary markup.
  it('finds nothing in ordinary text', () => {
    expect(parseTextualToolCalls('I lean back. <not a tool call>')).toEqual([]);
    expect(parseTextualToolCalls('')).toEqual([]);
  });

  it('keeps a non-numeric value as text', () => {
    const calls = parseTextualToolCalls(
      '<tool_call><function=variety><parameter=level>medium</parameter></function></tool_call>',
    );
    expect(calls[0]!.arguments).toBe(JSON.stringify({ level: 'medium' }));
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
  it('leaves only what she actually said', () => {
    expect(stripTextualToolCalls(OBSERVED)).toBe("Don't move. Not yet.");
  });

  it('closes the gap a removed block leaves mid-message', () => {
    expect(
      stripTextualToolCalls(
        'Before.\n\n<tool_call><function=stop></function></tool_call>\n\nAfter.',
      ),
    ).toBe('Before.\n\nAfter.');
  });

  it('leaves text without a block untouched', () => {
    expect(stripTextualToolCalls('Just talking.')).toBe('Just talking.');
  });

  // A turn that was nothing but the block leaves nothing to say — the caller
  // treats an empty reply as "she acted without speaking", which is right.
  it('empties a turn that was only a call', () => {
    expect(
      stripTextualToolCalls(
        '<tool_call><function=stop></function></tool_call>',
      ),
    ).toBe('');
  });
});
