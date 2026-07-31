/**
 * @jest-environment jsdom
 */
// What a companion turn commits, and when. The transcript is drawn from the
// thread's own turns plus `replyText` — the streamed copy shown as the pending
// bubble — so a line must be in exactly one of the two the whole time it is
// being spoken, or it is on screen twice or not at all. The thread is read here
// as persistThread writes it (localStorage, synchronously), which is the same
// state the panel renders without depending on when React flushed. The LLM
// stream and the TTS player are faked at their boundaries; the tool rounds and
// the abort handling are the real ones. Also what a reset has to take with it:
// the mic and the STT socket are faked just enough for start() to build a
// session, so a test can reach the scheduler a turn arms.

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { parse, type ThreadTurn } from '@/lib/companions/conversation';
import type { Companion } from '@/lib/companions/companions';
import type { CompanionTool } from '@/lib/companions/tools';
import type { ToolCall } from '@/lib/llm/client';

// One scripted LLM reply: the text it streams, and the calls it asks for.
type Reply = { content: string; toolCalls?: ToolCall[] };

const THREAD_KEY = 'companions:thread:test';

// Read and written by the fakes below, and reset per test.
let replies: Reply[] = [];
// The thread as stored at the moment each line was handed to the player.
let played: { text: string; thread: ThreadTurn[] }[] = [];
// The seam a test uses to act mid-utterance (a barge-in).
let onPlay: ((text: string) => void) | undefined;

jest.mock('../lib/llm/client', () => ({
  createLlmClient: () => ({
    stream: (
      _messages: unknown,
      opts: { onToolCalls?: (calls: ToolCall[]) => void },
    ) => ({
      async *[Symbol.asyncIterator](): AsyncGenerator<string> {
        const reply: Reply = replies.shift() ?? { content: '' };
        // Two deltas, so the hook assembles replyText rather than being handed
        // it whole.
        if (reply.content !== '') {
          const half = Math.ceil(reply.content.length / 2);
          yield reply.content.slice(0, half);
          yield reply.content.slice(half);
        }
        // After the stream, and only when there are calls — the real client.
        if (reply.toolCalls !== undefined && reply.toolCalls.length > 0) {
          opts.onToolCalls?.(reply.toolCalls);
        }
      },
    }),
  }),
}));

// The mic and the STT socket only need to exist for start() to build a session;
// these tests drive turns through submitText, never through speech.
jest.mock('../lib/voice/mic', () => ({
  startMic: () =>
    Promise.resolve({
      preRoll: { length: 0, push: () => {}, flush: () => [] },
      stop: () => {},
    }),
}));

jest.mock('../lib/voice/stt', () => ({
  createStt: () => ({
    beginUtterance: () => {},
    sendFrame: () => {},
    close: () => {},
    phase: () => 'closed',
    framesSent: () => 0,
  }),
}));

// The shortest real ambient pause is 2.5s (ambient.ts's table), far past the
// event loop these tests run on. Only the number is faked — the scheduler, the
// turn it starts and the thread it writes to are all real.
let ambientDelay = 60_000;
jest.mock('../lib/companions/ambient', () => ({
  ...(jest.requireActual('../lib/companions/ambient') as object),
  ambientDelayMs: () => ambientDelay,
}));

jest.mock('../lib/voice/tts', () => ({
  createTtsPlayer: () => ({
    play: async (
      text: string,
      _voiceId: string,
      _signal: AbortSignal,
      onFirstByte?: () => void,
    ): Promise<void> => {
      played.push({ text, thread: parse(localStorage.getItem(THREAD_KEY)) });
      // An utterance takes time; a player resolving in none of it would let a
      // whole turn run inside one tick.
      await new Promise((resolve) => setTimeout(resolve, 0));
      onFirstByte?.();
      onPlay?.(text);
      // The real player resolves whether playback finished or was cut, so this
      // does too.
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    stop: () => {},
  }),
}));

const COMPANION: Companion = {
  id: 'test' as Companion['id'],
  name: 'Test',
  description: 'fixture',
  gender: 'nonbinary',
  accentColour: 'pink',
  voiceId: 'voice',
  systemPrompt: 'be a fixture',
  model: 'test/model',
  contextWindow: 128000,
  passesReasoning: false,
  chattiness: 3,
  playfulness: 3,
  usesRealTime: true,
  knowsUserTime: true,
};

// The one tool the scripts call, recording that it ran: a tool must not run at
// all when the line that preceded it was cut.
const searchMedia = (ran: string[]): CompanionTool => ({
  name: 'search_media',
  description: 'fixture',
  run: () => {
    ran.push('search_media');
    return 'one match';
  },
});

const call = (name: string): ToolCall => ({
  id: `call-${name}`,
  name,
  arguments: '{}',
});

// Imported here rather than at the top of the file: jest.mock is not hoisted
// above the imports by this transform, so a module pulling in a faked one has
// to be loaded after the fakes are registered (use-goonpack-library.test.ts
// loads its hook the same way).
const session = async (tools: CompanionTool[]) => {
  const { useVoiceSession } = await import('./use-voice-session');
  const { result } = renderHook(() =>
    useVoiceSession({ companion: COMPANION, tools }),
  );
  // The panel attaches this, and ensureClients builds no clients without it.
  result.current.audioRef.current = document.createElement('audio');
  return result;
};

// Run the turn out. It is started detached (submitText returns at once) and its
// utterances cross timers, so it needs the event loop rather than a flush of
// microtasks.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

beforeEach(() => {
  replies = [];
  played = [];
  onPlay = undefined;
  ambientDelay = 60_000;
  localStorage.clear();
});

describe('useVoiceSession', () => {
  it("commits a round's pre-tool line with its tool results and clears the streamed copy", async () => {
    const ran: string[] = [];
    replies = [
      { content: 'mm, hold on', toolCalls: [call('search_media')] },
      { content: 'there you go' },
    ];
    const result = await session([searchMedia(ran)]);

    act(() => {
      result.current.submitText('show me something', { speak: true });
    });
    await settle();

    expect(ran).toEqual(['search_media']);
    expect(result.current.status.thread).toEqual([
      expect.objectContaining({ role: 'user', content: 'show me something' }),
      expect.objectContaining({
        role: 'assistant',
        content: 'mm, hold on',
        toolCalls: [call('search_media')],
      }),
      expect.objectContaining({
        role: 'tool',
        name: 'search_media',
        result: 'one match',
      }),
      expect.objectContaining({ role: 'assistant', content: 'there you go' }),
    ]);

    // A pre-tool line is spoken before the round carrying it is stored, so for
    // that whole utterance the streamed copy is the only place it exists — and
    // the only thing the transcript can draw it from.
    // The closing line is the other way round: its turn is stored before it is
    // spoken, so the streamed copy has to be empty for the whole utterance or
    // the line is drawn twice.
    expect(played).toEqual([
      {
        text: 'mm, hold on',
        thread: [expect.objectContaining({ role: 'user' })],
      },
      {
        text: 'there you go',
        thread: expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            content: 'there you go',
          }),
        ]),
      },
    ]);
    expect(result.current.status.replyText).toBe('');
  });

  it('leaves nothing stored when a barge-in cuts a pre-tool line', async () => {
    const ran: string[] = [];
    replies = [
      { content: 'mm, hold on', toolCalls: [call('search_media')] },
      { content: 'there you go' },
    ];
    const result = await session([searchMedia(ran)]);
    onPlay = () => {
      onPlay = undefined;
      result.current.cancelReply();
    };

    act(() => {
      result.current.submitText('show me something', { speak: true });
    });
    await settle();

    expect(played.map((p) => p.text)).toEqual(['mm, hold on']);
    expect(ran).toEqual([]);
    expect(result.current.status.thread).toEqual([
      expect.objectContaining({ role: 'user', content: 'show me something' }),
    ]);
  });

  it('cancels an armed ambient poke when the thread is cleared, so nothing lands in the emptied thread', async () => {
    // Long enough that the poke is still pending when settle() returns, short
    // enough that it would have fired well inside the wait after the clear.
    ambientDelay = 150;
    replies = [{ content: 'hello' }, { content: 'still there?' }];
    const result = await session([]);
    await act(async () => {
      result.current.start();
    });

    act(() => {
      result.current.submitText('hi', { speak: true });
    });
    await settle();

    act(() => {
      result.current.clearThread();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    expect(localStorage.getItem(THREAD_KEY)).toBeNull();
    expect(result.current.status.thread).toEqual([]);
  });
});
