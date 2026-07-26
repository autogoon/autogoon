import { describe, it, expect } from '@jest/globals';
import {
  appendUser,
  appendAssistant,
  appendTool,
  toLlmMessages,
  serialize,
  parse,
  describeGap,
  describeClock,
  sameLocalDay,
  isSilentAssistantTurn,
  GAP_MARKER_MIN_MS,
  type Thread,
} from './conversation';

describe('isSilentAssistantTurn', () => {
  it('is silent for an assistant turn with no spoken text', () => {
    expect(
      isSilentAssistantTurn({
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'send_media', arguments: '{}' }],
      }),
    ).toBe(true);
    expect(isSilentAssistantTurn({ role: 'assistant', content: '  ' })).toBe(
      true,
    );
  });

  it('is not silent for an assistant turn with spoken text', () => {
    expect(
      isSilentAssistantTurn({ role: 'assistant', content: 'here you go' }),
    ).toBe(false);
  });

  it('is not silent for a user turn with empty content', () => {
    expect(isSilentAssistantTurn({ role: 'user', content: '' })).toBe(false);
  });
});

describe('conversation thread builders', () => {
  it('appendUser does not mutate the thread it appends to', () => {
    const base: Thread = [{ role: 'user', content: 'first' }];
    const snapshot: Thread = JSON.parse(JSON.stringify(base)) as Thread;
    const after = appendUser(base, 'second');
    expect(base).toEqual(snapshot);
    expect(after).toEqual([
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
    ]);
  });

  it('appendAssistant does not mutate the thread it appends to', () => {
    const base: Thread = [{ role: 'user', content: 'first' }];
    const snapshot: Thread = JSON.parse(JSON.stringify(base)) as Thread;
    const after = appendAssistant(base, 'reply');
    expect(base).toEqual(snapshot);
    expect(after).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
    ]);
  });

  it('appendAssistant stores reasoningDetails only when provided', () => {
    const withReasoning = appendAssistant([], 'hi', [{ index: 0, text: 't' }]);
    expect(withReasoning).toEqual([
      {
        role: 'assistant',
        content: 'hi',
        reasoningDetails: [{ index: 0, text: 't' }],
      },
    ]);
    const without = appendAssistant([], 'hi');
    expect(without).toEqual([{ role: 'assistant', content: 'hi' }]);
    expect('reasoningDetails' in without[0]!).toBe(false);
  });
});

describe('toLlmMessages', () => {
  const thread: Thread = [
    { role: 'user', content: 'hey' },
    {
      role: 'assistant',
      content: 'hi',
      reasoningDetails: [{ index: 0, text: 'r' }],
    },
    { role: 'user', content: 'again' },
  ];

  it('puts the system message first, then every turn in order', () => {
    const msgs = toLlmMessages(thread, 'SYS', false);
    expect(msgs[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(msgs.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
  });

  it('emits reasoningDetails on assistant turns only when passesReasoning is true', () => {
    const on = toLlmMessages(thread, 'SYS', true);
    expect(on[2]).toEqual({
      role: 'assistant',
      content: 'hi',
      reasoningDetails: [{ index: 0, text: 'r' }],
    });
    const off = toLlmMessages(thread, 'SYS', false);
    expect(off[2]!).toEqual({ role: 'assistant', content: 'hi' });
    expect('reasoningDetails' in off[2]!).toBe(false);
  });

  it('never emits reasoningDetails for assistant turns that carry none', () => {
    const t: Thread = [{ role: 'assistant', content: 'hi' }];
    expect(toLlmMessages(t, 'SYS', true)[1]!).toEqual({
      role: 'assistant',
      content: 'hi',
    });
  });
});

describe('serialize / parse', () => {
  it('round-trips a thread', () => {
    const thread: Thread = [
      { role: 'user', content: 'a' },
      {
        role: 'assistant',
        content: 'b',
        reasoningDetails: [{ index: 0, text: 'x' }],
      },
    ];
    expect(parse(serialize(thread))).toEqual(thread);
  });

  it('returns [] for a null raw value', () => {
    expect(parse(null)).toEqual([]);
  });

  it("returns [] for a string that isn't JSON", () => {
    expect(parse('not json')).toEqual([]);
  });

  it("returns [] for JSON that isn't an array", () => {
    expect(parse('{}')).toEqual([]);
    expect(parse('{"role":"user"}')).toEqual([]);
  });

  it("returns [] for an array item that isn't an object", () => {
    expect(parse('[null]')).toEqual([]);
    expect(parse('[3]')).toEqual([]);
    expect(parse('["hi"]')).toEqual([]);
  });

  it('returns [] for a user turn with no content', () => {
    expect(parse('[{"role":"user"}]')).toEqual([]);
  });

  it('returns [] for a turn with an unrecognised role', () => {
    expect(parse('[{"role":"bot","content":"x"}]')).toEqual([]);
  });

  it("returns [] for an assistant turn whose reasoningDetails isn't an array", () => {
    expect(
      parse('[{"role":"assistant","content":"x","reasoningDetails":"nope"}]'),
    ).toEqual([]);
  });
});

describe('tool turns', () => {
  it('appendTool appends a linked tool turn without mutating the input', () => {
    const base: Thread = [{ role: 'user', content: 'start it' }];
    const after = appendTool(base, 'start', 'started', 'call_1');
    expect(base).toEqual([{ role: 'user', content: 'start it' }]);
    expect(after[after.length - 1]!).toEqual({
      role: 'tool',
      name: 'start',
      result: 'started',
      toolCallId: 'call_1',
    });
  });

  it('appendTool stores mediaRef only when given', () => {
    expect(
      appendTool([], 'send_media', 'sent a picture', 'call_1', 'still-7.jpg'),
    ).toEqual([
      {
        role: 'tool',
        name: 'send_media',
        result: 'sent a picture',
        toolCallId: 'call_1',
        mediaRef: 'still-7.jpg',
      },
    ]);
    const without = appendTool([], 'start', 'started', 'call_1');
    expect('mediaRef' in without[0]!).toBe(false);
  });

  it('appendAssistant carries toolCalls only when provided', () => {
    const calls = [{ id: 'call_1', name: 'start', arguments: '{}' }];
    const withCalls = appendAssistant([], '', undefined, calls);
    expect(withCalls).toEqual([
      { role: 'assistant', content: '', toolCalls: calls },
    ]);
    const without = appendAssistant([], 'hi');
    expect('toolCalls' in without[0]!).toBe(false);
  });

  it('toLlmMessages replays the agentic sequence (assistant call → tool result)', () => {
    const calls = [{ id: 'call_1', name: 'start', arguments: '{}' }];
    const thread: Thread = [
      { role: 'user', content: 'start it' },
      { role: 'assistant', content: '', toolCalls: calls },
      { role: 'tool', name: 'start', result: 'started', toolCallId: 'call_1' },
      { role: 'assistant', content: "it's on" },
    ];
    const msgs = toLlmMessages(thread, 'SYS', true);
    expect(msgs).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'start it' },
      { role: 'assistant', content: '', toolCalls: calls },
      { role: 'tool', content: 'started', toolCallId: 'call_1' },
      { role: 'assistant', content: "it's on" },
    ]);
  });

  it("toLlmMessages never sends a tool turn's mediaRef to the model, only its result", () => {
    const thread: Thread = [
      {
        role: 'tool',
        name: 'send_media',
        result: 'sent a picture',
        toolCallId: 'call_1',
        mediaRef: 'still-7.jpg',
      },
    ];
    expect(toLlmMessages(thread, 'SYS', true)).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'tool', content: 'sent a picture', toolCallId: 'call_1' },
    ]);
  });

  it('serialize/parse round-trips the agentic sequence', () => {
    const calls = [{ id: 'call_1', name: 'start', arguments: '{}' }];
    const thread: Thread = [
      { role: 'user', content: 'start it' },
      { role: 'assistant', content: '', toolCalls: calls },
      { role: 'tool', name: 'start', result: 'started', toolCallId: 'call_1' },
    ];
    expect(parse(serialize(thread))).toEqual(thread);
  });

  it("serialize/parse round-trips a tool turn's mediaRef", () => {
    const thread: Thread = [
      {
        role: 'tool',
        name: 'send_media',
        result: 'sent a picture',
        toolCallId: 'call_1',
        mediaRef: 'still-7.jpg',
      },
    ];
    expect(parse(serialize(thread))).toEqual(thread);
  });

  it('parse rejects a tool turn missing name, result, or toolCallId', () => {
    expect(
      parse('[{"role":"tool","name":"start","result":"started"}]'),
    ).toEqual([]);
    expect(parse('[{"role":"tool","name":"start","toolCallId":"c1"}]')).toEqual(
      [],
    );
    expect(
      parse('[{"role":"tool","result":"started","toolCallId":"c1"}]'),
    ).toEqual([]);
  });

  it("parse rejects a tool turn whose mediaRef isn't a string", () => {
    expect(
      parse(
        '[{"role":"tool","name":"send_media","result":"sent","toolCallId":"c1","mediaRef":7}]',
      ),
    ).toEqual([]);
  });

  it('parse discards the whole thread, valid turns included, when a tool turn has no toolCallId', () => {
    expect(
      parse(
        '[{"role":"user","content":"a"},{"role":"tool","name":"start","result":"x"}]',
      ),
    ).toEqual([]);
  });

  it('parse rejects an assistant turn whose toolCalls is not an array', () => {
    expect(
      parse('[{"role":"assistant","content":"","toolCalls":"nope"}]'),
    ).toEqual([]);
  });
});

describe('turn timestamps', () => {
  it('appendUser stamps `at` only when given', () => {
    expect(appendUser([], 'hi', 1000)).toEqual([
      { role: 'user', content: 'hi', at: 1000 },
    ]);
    expect('at' in appendUser([], 'hi')[0]!).toBe(false);
  });

  it('appendAssistant stamps `at` only when given', () => {
    expect(appendAssistant([], 'yo', undefined, undefined, 2000)).toEqual([
      { role: 'assistant', content: 'yo', at: 2000 },
    ]);
    expect('at' in appendAssistant([], 'yo')[0]!).toBe(false);
  });

  it('appendTool stamps `at` only when given', () => {
    expect(appendTool([], 'start', 'started', 'c1', undefined, 3000)).toEqual([
      {
        role: 'tool',
        name: 'start',
        result: 'started',
        toolCallId: 'c1',
        at: 3000,
      },
    ]);
    expect('at' in appendTool([], 'start', 'started', 'c1')[0]!).toBe(false);
  });

  it('serialize/parse round-trips a stamped `at`', () => {
    const thread: Thread = [{ role: 'user', content: 'a', at: 1000 }];
    expect(parse(serialize(thread))).toEqual(thread);
  });

  it('parse accepts an un-stamped legacy turn', () => {
    const thread: Thread = [{ role: 'assistant', content: 'b' }];
    expect(parse(serialize(thread))).toEqual(thread);
  });

  it('parse rejects a turn whose `at` is not a number', () => {
    expect(parse('[{"role":"user","content":"a","at":"noon"}]')).toEqual([]);
  });
});

describe('gap markers in toLlmMessages', () => {
  const HOUR = 3_600_000;

  it('inserts a system marker before a user turn after a long gap', () => {
    const thread: Thread = [
      { role: 'user', content: 'hey', at: 0 },
      { role: 'assistant', content: 'hi', at: 1000 },
      { role: 'user', content: 'back', at: 1000 + 2 * HOUR },
    ];
    const msgs = toLlmMessages(thread, 'SYS', false);
    expect(msgs.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'system',
      'user',
    ]);
    expect(msgs[3]!.content).toBe('(2 hours pass.)');
  });

  it('inserts a marker when the gap is exactly GAP_MARKER_MIN_MS', () => {
    const thread: Thread = [
      { role: 'assistant', content: 'hi', at: 0 },
      { role: 'user', content: 'back', at: GAP_MARKER_MIN_MS },
    ];
    const msgs = toLlmMessages(thread, 'SYS', false);
    expect(msgs.map((m) => m.role)).toEqual([
      'system',
      'assistant',
      'system',
      'user',
    ]);
    expect(msgs[2]!.content).toBe('(15 minutes pass.)');
  });

  it('inserts no marker when the gap is under GAP_MARKER_MIN_MS', () => {
    const thread: Thread = [
      { role: 'assistant', content: 'hi', at: 0 },
      { role: 'user', content: 'back', at: GAP_MARKER_MIN_MS - 1 },
    ];
    expect(toLlmMessages(thread, 'SYS', false).map((m) => m.role)).toEqual([
      'system',
      'assistant',
      'user',
    ]);
  });

  it('inserts no marker when either side is un-stamped', () => {
    const legacyPrev: Thread = [
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'back', at: 5 * HOUR },
    ];
    expect(toLlmMessages(legacyPrev, 'SYS', false).map((m) => m.role)).toEqual([
      'system',
      'assistant',
      'user',
    ]);
    const legacyNext: Thread = [
      { role: 'assistant', content: 'hi', at: 0 },
      { role: 'user', content: 'back' },
    ];
    expect(toLlmMessages(legacyNext, 'SYS', false).map((m) => m.role)).toEqual([
      'system',
      'assistant',
      'user',
    ]);
  });

  it('inserts no marker between an assistant tool call and its result', () => {
    const calls = [{ id: 'c1', name: 'start', arguments: '{}' }];
    const thread: Thread = [
      { role: 'user', content: 'start it', at: 0 },
      { role: 'assistant', content: '', toolCalls: calls, at: 2 * HOUR },
      {
        role: 'tool',
        name: 'start',
        result: 'started',
        toolCallId: 'c1',
        at: 4 * HOUR,
      },
      { role: 'assistant', content: "it's on", at: 6 * HOUR },
    ];
    expect(toLlmMessages(thread, 'SYS', false).map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });

  it('never puts a marker before the first turn', () => {
    const thread: Thread = [{ role: 'user', content: 'hey', at: 99 * HOUR }];
    expect(toLlmMessages(thread, 'SYS', false).map((m) => m.role)).toEqual([
      'system',
      'user',
    ]);
  });
});

describe('describeGap', () => {
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  it('speaks minutes under an hour', () => {
    expect(describeGap(20 * MIN)).toBe('20 minutes pass.');
    expect(describeGap(59 * MIN)).toBe('59 minutes pass.');
  });

  it('speaks hours under a day, singular at one', () => {
    expect(describeGap(HOUR)).toBe('1 hour passes.');
    expect(describeGap(6 * HOUR)).toBe('6 hours pass.');
  });

  it('rounds to the nearest hour, so 90 minutes reads as 2 hours', () => {
    expect(describeGap(90 * MIN)).toBe('2 hours pass.');
  });

  it('speaks days from a day up, singular at one', () => {
    expect(describeGap(DAY)).toBe('1 day passes.');
    expect(describeGap(3 * DAY)).toBe('3 days pass.');
  });

  it('rounds to the nearest day, so 26 hours reads as 1 day', () => {
    expect(describeGap(26 * HOUR)).toBe('1 day passes.');
  });
});

describe('describeClock', () => {
  it('formats a local timestamp as weekday, date and 12-hour time', () => {
    // Built from local parts so the assertion holds in any timezone.
    const at = new Date(2026, 6, 23, 14, 5).getTime(); // 23 July 2026, 2:05 pm
    expect(describeClock(at)).toBe('Thursday 23 July 2026, 2:05 pm');
  });

  it('renders midnight as 12:00 am', () => {
    expect(describeClock(new Date(2026, 0, 5, 0, 0).getTime())).toBe(
      'Monday 5 January 2026, 12:00 am',
    );
  });

  it('renders half past noon as 12:30 pm', () => {
    expect(describeClock(new Date(2026, 0, 5, 12, 30).getTime())).toBe(
      'Monday 5 January 2026, 12:30 pm',
    );
  });
});

describe('sameLocalDay', () => {
  it('is true for two times in the same local calendar day', () => {
    const morning = new Date(2026, 6, 23, 9, 0).getTime();
    const night = new Date(2026, 6, 23, 23, 59).getTime();
    expect(sameLocalDay(morning, night)).toBe(true);
  });

  it('is false for times either side of local midnight', () => {
    const night = new Date(2026, 6, 23, 23, 59).getTime();
    const nextDay = new Date(2026, 6, 24, 0, 1).getTime();
    expect(sameLocalDay(night, nextDay)).toBe(false);
  });
});
