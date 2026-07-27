import { describe, expect, it } from '@jest/globals';
import { strToU8, zipSync } from 'fflate';
import { extractionError, prepareImport } from './import';
import { PackError } from './manifest';

// Everything that writes a tree is a worker, OPFS and Web Locks, and is covered
// by tests/e2e/goonpack-import.spec.ts. What's decided here needs none of it:
// which story a failure inside the worker tells the user, and the errors
// prepareImport raises off the zip peek alone, before a byte is written.

const zipFile = (files: Record<string, Uint8Array>): File =>
  new File([zipSync(files)], 'pack.zip', { type: 'application/zip' });

// Only an Error's name and message cross the worker boundary, so `name` is all
// these cases have to tell one kind of failure from another.
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

describe('prepareImport', () => {
  // The fixture is what Finder's Compress makes of a pack folder, which is the
  // commonest way to zip the folder by mistake. It spans peekZip and
  // wrapperFolder: junk left in the names makes __MACOSX/ a second top-level
  // folder, wrapperFolder finds no single wrapper, and the one message that
  // names the mistake degrades to the generic one below.
  it('names the wrapper folder when a Finder zip holds the pack folder itself', async () => {
    await expect(
      prepareImport(
        zipFile({
          'yourpack/manifest.json': strToU8(
            JSON.stringify({ format: 2, id: 'test.pack', version: '1.0.0' }),
          ),
          'yourpack/media/a.jpg': strToU8('x'),
          '__MACOSX/._manifest.json': strToU8('junk'),
        }),
        new Map(),
      ),
    ).rejects.toThrow(
      new PackError(
        "Everything is inside yourpack/ — zip the folder's contents, not the folder.",
      ),
    );
  });

  it('asks for a root manifest when the zip has no single wrapper folder', async () => {
    await expect(
      prepareImport(
        zipFile({
          'a/manifest.json': strToU8('{}'),
          'b/notes.txt': strToU8('x'),
        }),
        new Map(),
      ),
    ).rejects.toThrow(
      new PackError(
        "No manifest.json at the zip root — zip the pack folder's contents, not the folder.",
      ),
    );
  });
});
