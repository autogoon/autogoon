import { describe, it, expect } from '@jest/globals';
import {
  shouldOpenSocket,
  isBargeIn,
  partialHasWord,
  partialWordCount,
  confirmSpeech,
  voiceStage,
} from './session-policy';

// Thresholds standing in for the app's, so the cases read as behaviour rather
// than arithmetic.
const MIN = { voicedMs: 150, words: 2 };

// A convenient idle baseline for voiceStage tests.
const IDLE = {
  partial: '',
  replyPlaying: false,
  replyText: '',
  awaitingSpeech: false,
  speaking: false,
};

describe('session-policy', () => {
  it('opens on onset only when closed', () => {
    expect(shouldOpenSocket('closed', true)).toBe(true);
    expect(shouldOpenSocket('closed', false)).toBe(false);
    expect(shouldOpenSocket('open', true)).toBe(false);
    expect(shouldOpenSocket('connecting', true)).toBe(false);
  });

  it('is a barge-in only when a reply is playing and speech is confirmed', () => {
    expect(isBargeIn(true, true)).toBe(true);
    expect(isBargeIn(false, true)).toBe(false);
    expect(isBargeIn(true, false)).toBe(false);
  });

  // The phantom: one hallucinated token, no voicing worth the name behind it.
  // It has to fail both tests, which is what makes it distinguishable at all.
  it('does not confirm a lone token backed only by a transient', () => {
    expect(confirmSpeech(false, 'No.', 60, MIN)).toBe(false);
    expect(confirmSpeech(false, 'Yes', 149, MIN)).toBe(false);
  });

  it('confirms a worded partial backed by sustained voicing', () => {
    expect(confirmSpeech(false, 'stop', 150, MIN)).toBe(true);
    expect(confirmSpeech(false, 'stop', 900, MIN)).toBe(true);
  });

  // Quiet speech: the VAD tracks loudness, so a softly-spoken sentence dips
  // under the offset threshold and is credited a fraction of its real length —
  // 80ms for "Thank you, honey." on the hardware. The words carry it instead.
  it('confirms a multi-word partial the VAD barely registered', () => {
    expect(confirmSpeech(false, 'Thank you,', 80, MIN)).toBe(true);
    expect(confirmSpeech(false, "It's okay.", 0, MIN)).toBe(true);
  });

  it('stays confirmed for trailing partials once the utterance qualified', () => {
    expect(confirmSpeech(true, 'and', 0, MIN)).toBe(true);
  });

  it('does not confirm without a decoded word, however long the voicing', () => {
    expect(confirmSpeech(false, '...', 900, MIN)).toBe(false);
  });

  it('counts only tokens carrying a letter or digit as words', () => {
    expect(partialWordCount('Thank you,')).toBe(2);
    expect(partialWordCount('Yes.')).toBe(1);
    expect(partialWordCount('  hey   there  ')).toBe(2);
    expect(partialWordCount('... ,')).toBe(0);
    expect(partialWordCount('')).toBe(0);
  });

  it('counts a partial as a word only once it holds a real word', () => {
    expect(partialHasWord('stop')).toBe(true);
    expect(partialHasWord('  hey ')).toBe(true);
    expect(partialHasWord('')).toBe(false);
    expect(partialHasWord('  ')).toBe(false);
    expect(partialHasWord('...')).toBe(false);
  });

  it('is idle with nothing in flight', () => {
    expect(voiceStage(IDLE)).toBe('idle');
  });

  it('walks a spoken turn through its stages', () => {
    // Request sent, no first token yet.
    expect(voiceStage({ ...IDLE, replyPlaying: true })).toBe('thinking');
    // Tokens arriving.
    expect(voiceStage({ ...IDLE, replyPlaying: true, replyText: 'hey' })).toBe(
      'streaming',
    );
    // TTS requested, no audio yet.
    expect(
      voiceStage({
        ...IDLE,
        replyPlaying: true,
        replyText: 'hey',
        awaitingSpeech: true,
      }),
    ).toBe('tts');
    // Audio playing.
    expect(
      voiceStage({
        ...IDLE,
        replyPlaying: true,
        replyText: 'hey',
        speaking: true,
      }),
    ).toBe('speaking');
  });

  it('is listening whenever a partial is showing, over any reply state', () => {
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
