import { describe, expect, it } from '@jest/globals';
import { extractionError } from './import';

// The rest of the import pipeline is a worker, OPFS and Web Locks, and is
// covered by tests/e2e/goonpack-import.spec.ts. What's decided here is which
// story a failure inside the worker tells the user.
describe('extractionError', () => {
  it('says the storage filled up when it did', () => {
    expect(
      extractionError('QuotaExceededError', 'The quota has been exceeded')
        .problems,
    ).toEqual([
      'Browser storage filled up part-way through unpacking this pack — free some space and try again.',
    ]);
  });

  it('blames the zip for anything else', () => {
    expect(extractionError('Error', 'invalid zip data').problems).toEqual([
      "The zip couldn't be read: invalid zip data.",
    ]);
  });
});
