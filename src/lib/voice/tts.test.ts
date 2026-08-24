// What this file decides: that a failure to speak is reported, and that a
// barge-in — the normal way a reply ends early — is not. Playback itself needs
// a real element and is exercised in tests/e2e.
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { createTtsPlayer } from './tts';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

// play() only ever pauses, clears and reloads the element on the paths reached
// here, so the cast covers members the failure paths never touch.
const stubAudio = (): HTMLAudioElement =>
  ({
    addEventListener: () => {},
    removeEventListener: () => {},
    pause: () => {},
    removeAttribute: () => {},
    load: () => {},
  }) as unknown as HTMLAudioElement;

describe('createTtsPlayer', () => {
  it('reports a non-OK response, which resolving play() alone would not distinguish from a spoken reply', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response('upstream refused', { status: 503 })),
    ) as unknown as typeof fetch;
    const errors: string[] = [];
    const tts = createTtsPlayer(stubAudio(), (m) => errors.push(m));

    await tts.play('hello', 'voice-id', new AbortController().signal);

    expect(errors).toEqual(['ElevenLabs 503: upstream refused']);
  });

  it('names the fix for a rejected key without quoting the response back', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response('{"detail":{"message":"Invalid API key sk_el-1"}}', {
          status: 401,
        }),
      ),
    ) as unknown as typeof fetch;
    const errors: string[] = [];
    const tts = createTtsPlayer(stubAudio(), (m) => errors.push(m));

    await tts.play('hello', 'voice-id', new AbortController().signal);

    expect(errors).toEqual([
      'ElevenLabs rejected your API key — check it in Settings.',
    ]);
  });

  it('says nothing when a barge-in aborts the request', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    }) as unknown as typeof fetch;
    const errors: string[] = [];
    const tts = createTtsPlayer(stubAudio(), (m) => errors.push(m));

    await tts.play('hello', 'voice-id', controller.signal);

    expect(errors).toEqual([]);
  });
});
