import { describe, expect, it } from '@jest/globals';
import { extractionError } from './import';

// The rest of the import pipeline is a worker, OPFS and Web Locks, and is
// covered by tests/e2e/goonpack-import.spec.ts. What's decided here is which
// story a failure inside the worker tells the user. Only an Error's name and
// message cross the worker boundary, so `name` is all these cases have to tell
// one kind of failure from another.
describe('extractionError', () => {
  // Without this case a full disk reports "The zip couldn't be read: The quota
  // has been exceeded.", sending the user off to re-zip a pack that is fine.
  it('reports a QuotaExceededError as browser storage filling up', () => {
    expect(
      extractionError('QuotaExceededError', 'The quota has been exceeded')
        .problems,
    ).toEqual([
      'Browser storage filled up part-way through unpacking this pack — free some space and try again.',
    ]);
  });

  // openPackDir() runs inside the worker and throws PackError with the sentence
  // to show — "This browser can't store packs…" when OPFS won't open, "The pack
  // vanished from browser storage." when the directory is gone. Without this
  // case both arrive as "The zip couldn't be read: This browser can't store
  // packs…", blaming the archive for a storage failure.
  it('passes a PackError from the worker through unchanged', () => {
    expect(
      extractionError('PackError', 'The pack vanished from browser storage.')
        .problems,
    ).toEqual(['The pack vanished from browser storage.']);
  });

  it("reports a plain Error as a zip that couldn't be read, quoting its message", () => {
    expect(extractionError('Error', 'invalid zip data').problems).toEqual([
      "The zip couldn't be read: invalid zip data.",
    ]);
  });
});
