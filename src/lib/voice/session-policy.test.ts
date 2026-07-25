import { describe, it, expect } from '@jest/globals';
import {
  shouldOpenSocket,
  shouldCloseSocket,
  isBargeIn,
  partialHasWord,
  confirmSpeech,
  voiceStage,
} from './session-policy';

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

  it('closes an open socket after the quiet timeout', () => {
    expect(shouldCloseSocket('open', 1000, 1000 + 8000, 8000)).toBe(true);
    expect(shouldCloseSocket('open', 1000, 1000 + 7999, 8000)).toBe(false);
    expect(shouldCloseSocket('closed', 0, 999999, 8000)).toBe(false);
  });

  it('is a barge-in only when a reply is playing and speech is confirmed', () => {
    expect(isBargeIn(true, true)).toBe(true);
    expect(isBargeIn(false, true)).toBe(false);
    expect(isBargeIn(true, false)).toBe(false);
  });

  it('does not confirm speech on a phantom partial with the VAD silent', () => {
    expect(confirmSpeech(false, 'No.', false)).toBe(false);
    expect(confirmSpeech(false, 'Yes', false)).toBe(false);
  });

  it('confirms speech on a worded partial with live mic energy', () => {
    expect(confirmSpeech(false, 'hey there', true)).toBe(true);
  });

  it('stays confirmed for trailing partials after the VAD drops', () => {
    expect(confirmSpeech(true, 'hey there and', false)).toBe(true);
  });

  it('does not confirm on mic energy without a decoded word', () => {
    expect(confirmSpeech(false, '...', true)).toBe(false);
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
