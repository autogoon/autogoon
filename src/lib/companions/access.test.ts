import { describe, it, expect } from '@jest/globals';
import { parseAccessIds } from './access';

describe('parseAccessIds', () => {
  it('returns [] for unset or blank env, so nothing validates', () => {
    expect(parseAccessIds(undefined)).toEqual([]);
    expect(parseAccessIds('')).toEqual([]);
    expect(parseAccessIds('  ,  , ')).toEqual([]);
  });

  it('splits on commas, trimming and dropping blanks', () => {
    expect(parseAccessIds('alice-7f3a,bob-9c21')).toEqual([
      'alice-7f3a',
      'bob-9c21',
    ]);
    expect(parseAccessIds(' alice-7f3a , , bob-9c21 ,')).toEqual([
      'alice-7f3a',
      'bob-9c21',
    ]);
  });
});
