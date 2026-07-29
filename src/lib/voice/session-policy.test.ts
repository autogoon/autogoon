import { describe, it, expect } from '@jest/globals';
import {
  shouldOpenSocket,
  isBargeIn,
  partialWordCount,
  confirmSpeech,
  voiceStage,
} from './session-policy';

// PARTIAL_MIN's values (use-voice-session.ts). Barge-in applies the same
// function with a higher voicedMs.
const MIN = { voicedMs: 150, words: 2 };

// The idle baseline for the voiceStage tests.
const IDLE = {
  partial: '',
  replyPlaying: false,
  replyText: '',
  awaitingSpeech: false,
  speaking: false,
};

describe('session-policy', () => {
  it('shouldOpenSocket opens the STT socket on a VAD onset only while the socket is closed', () => {
    expect(shouldOpenSocket('closed', true)).toBe(true);
    expect(shouldOpenSocket('closed', false)).toBe(false);
    expect(shouldOpenSocket('open', true)).toBe(false);
    expect(shouldOpenSocket('connecting', true)).toBe(false);
    expect(shouldOpenSocket('closing', true)).toBe(false);
  });

  it('isBargeIn cuts the companion off only when a reply is playing and speech is confirmed', () => {
    expect(isBargeIn(true, true)).toBe(true);
    expect(isBargeIn(false, true)).toBe(false);
    expect(isBargeIn(true, false)).toBe(false);
  });

  // One hallucinated token, with no sustained voicing behind it.
  // 60ms is the shortest run the VAD can report at all (attackFrames 3 ×
  // FRAME_MS 20, mic.ts), and 149 sits a millisecond under the threshold.
  it('confirmSpeech does not confirm a lone token backed only by a transient', () => {
    expect(confirmSpeech(false, 'No.', 60, MIN)).toBe(false);
    expect(confirmSpeech(false, 'Yes', 149, MIN)).toBe(false);
  });

  it('confirmSpeech confirms a worded partial backed by sustained voicing', () => {
    expect(confirmSpeech(false, 'stop', 150, MIN)).toBe(true);
    expect(confirmSpeech(false, 'stop', 900, MIN)).toBe(true);
  });

  // Quiet speech: the VAD tracks loudness, so a softly-spoken sentence dips
  // under the offset threshold and is credited a fraction of its real length —
  // 80ms for "Thank you, honey." on the hardware. The words carry it instead.
  it('confirmSpeech confirms a multi-word partial the VAD barely registered', () => {
    expect(confirmSpeech(false, 'Thank you,', 80, MIN)).toBe(true);
    expect(confirmSpeech(false, "It's okay.", 0, MIN)).toBe(true);
  });

  it('confirmSpeech stays confirmed for trailing partials once the utterance qualified', () => {
    expect(confirmSpeech(true, 'and', 0, MIN)).toBe(true);
  });

  it('confirmSpeech does not confirm without a decoded word, however long the voicing', () => {
    expect(confirmSpeech(false, '...', 900, MIN)).toBe(false);
  });

  it('partialWordCount counts only tokens carrying a letter or digit as words', () => {
    expect(partialWordCount('Thank you,')).toBe(2);
    expect(partialWordCount('Yes.')).toBe(1);
    expect(partialWordCount('  hey   there  ')).toBe(2);
    expect(partialWordCount('... ,')).toBe(0);
    expect(partialWordCount('')).toBe(0);
  });

  it('voiceStage is idle with nothing in flight', () => {
    expect(voiceStage(IDLE)).toBe('idle');
  });

  it('voiceStage is thinking while a reply is pending with no tokens yet', () => {
    expect(voiceStage({ ...IDLE, replyPlaying: true })).toBe('thinking');
  });

  it('voiceStage is streaming once reply tokens have arrived', () => {
    expect(voiceStage({ ...IDLE, replyPlaying: true, replyText: 'hey' })).toBe(
      'streaming',
    );
  });

  it('voiceStage is tts while waiting for the first speech audio', () => {
    expect(
      voiceStage({
        ...IDLE,
        replyPlaying: true,
        replyText: 'hey',
        awaitingSpeech: true,
      }),
    ).toBe('tts');
  });

  it('voiceStage is speaking while reply audio plays', () => {
    expect(
      voiceStage({
        ...IDLE,
        replyPlaying: true,
        replyText: 'hey',
        speaking: true,
      }),
    ).toBe('speaking');
  });

  it('voiceStage is listening whenever a partial is showing, over any reply state', () => {
    expect(voiceStage({ ...IDLE, partial: 'so I was' })).toBe('listening');
    expect(
      voiceStage({
        ...IDLE,
        partial: 'so I was',
        replyPlaying: true,
        replyText: 'hey',
        speaking: true,
      }),
    ).toBe('listening');
  });
});
