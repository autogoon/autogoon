import { describe, expect, it } from '@jest/globals';
import { DEFAULT_SAFE_WORD, sanitizeSafeWord } from './safe-word';

// `reserved` stands in for the list the caller passes: words the vosk grammar
// already routes elsewhere, which the safe word must not collide with.
const RESERVED = ['connect', 'exit', 'settings', 'stop', 'goon'];

describe('sanitizeSafeWord', () => {
  it('accepts a plain lowercase word', () => {
    expect(sanitizeSafeWord('pineapple', RESERVED)).toBe('pineapple');
  });

  it('accepts a word with surrounding whitespace and capitals, normalized', () => {
    expect(sanitizeSafeWord('  Pineapple \n', RESERVED)).toBe('pineapple');
  });

  it('rejects the empty and whitespace-only string', () => {
    expect(sanitizeSafeWord('', RESERVED)).toBeNull();
    expect(sanitizeSafeWord('   ', RESERVED)).toBeNull();
  });

  it('rejects multiple words', () => {
    expect(sanitizeSafeWord('red light', RESERVED)).toBeNull();
  });

  it('rejects non-letter characters', () => {
    expect(sanitizeSafeWord('pine-apple', RESERVED)).toBeNull();
    expect(sanitizeSafeWord('stop!', RESERVED)).toBeNull();
    expect(sanitizeSafeWord('route66', RESERVED)).toBeNull();
  });

  it('rejects letters outside a–z, which the en-us grammar could never match', () => {
    expect(sanitizeSafeWord('café', RESERVED)).toBeNull();
  });

  it('rejects a reserved word however the user capitalized it', () => {
    expect(sanitizeSafeWord('stop', RESERVED)).toBeNull();
    expect(sanitizeSafeWord('Goon', RESERVED)).toBeNull();
  });

  it('accepts DEFAULT_SAFE_WORD', () => {
    expect(sanitizeSafeWord(DEFAULT_SAFE_WORD, RESERVED)).toBe(
      DEFAULT_SAFE_WORD,
    );
  });
});
