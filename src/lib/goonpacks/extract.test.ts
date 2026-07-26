import { describe, expect, it } from '@jest/globals';
import { strToU8, zipSync } from 'fflate';
import { extractZip, peekZip } from './extract';

// A real extraction needs OPFS and is covered by
// tests/e2e/goonpack-import.spec.ts; the fake below stands in only for WHICH
// entries get written. peekZip needs no more than a File, so the message an
// import opens with — named pack, wrapper folder, unreadable zip — is decided
// here.
const zipFile = (files: Record<string, Uint8Array>): File =>
  new File([zipSync(files)], 'pack.zip', { type: 'application/zip' });

const manifest = (id: string) =>
  strToU8(JSON.stringify({ format: 2, id, version: '1.0.0' }));

// Deliberately incompressible, so the zip really is big enough to span several
// reads of the file stream — a repeating fill would deflate to nothing and the
// whole archive would arrive in one chunk, proving nothing.
const bulky = (() => {
  const bytes = new Uint8Array(400_000);
  let x = 0x9e3779b9; // xorshift32: deflate finds nothing to squeeze out of it
  for (let i = 0; i < bytes.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    bytes[i] = (x >>> 24) & 0xff;
  }
  return bytes;
})();

// A directory handle that records the paths written under it — enough of the
// shape extractZip uses (nested directories, one writable per file) to say what
// landed and what didn't.
function fakeDir(written: Set<string>, prefix = ''): FileSystemDirectoryHandle {
  return {
    getDirectoryHandle: (name: string) =>
      Promise.resolve(fakeDir(written, `${prefix}${name}/`)),
    getFileHandle: (name: string) =>
      Promise.resolve({
        createWritable: () => {
          written.add(`${prefix}${name}`);
          return Promise.resolve({
            write: () => Promise.resolve(),
            close: () => Promise.resolve(),
          });
        },
      }),
  } as unknown as FileSystemDirectoryHandle;
}

describe('extractZip', () => {
  it('drops junk and any forged completion marker on the way in', async () => {
    const written = new Set<string>();
    await extractZip(
      zipFile({
        'manifest.json': manifest('test.pack'),
        // A pack author's own file that happens to share the marker's name.
        // Written, it would make an interrupted import look finished.
        '.complete': strToU8('not mine to write'),
        '.DS_Store': strToU8('junk'),
        '__MACOSX/._manifest.json': strToU8('junk'),
        'media/a.jpg': strToU8('x'),
      }),
      fakeDir(written),
    );
    expect([...written].sort()).toEqual(['manifest.json', 'media/a.jpg']);
  });
});

describe('peekZip', () => {
  it("reads the root manifest's text and lists what it saw", async () => {
    const { manifest: raw, names } = await peekZip(
      zipFile({
        'manifest.json': manifest('test.pack'),
        'system-prompt.md': strToU8('You are Testy.'),
        'media/big.mp4': bulky,
      }),
    );
    expect(JSON.parse(raw!)).toMatchObject({ id: 'test.pack' });
    expect(names).toContain('manifest.json');
  });

  it('comes back with no manifest and the names that explain why', async () => {
    const { manifest: raw, names } = await peekZip(
      zipFile({
        'yourpack/manifest.json': manifest('test.pack'),
        'yourpack/media/a.jpg': strToU8('x'),
      }),
    );
    expect(raw).toBeNull();
    // prepareImport names the wrapper folder from exactly these.
    expect(names.sort()).toEqual([
      'yourpack/manifest.json',
      'yourpack/media/a.jpg',
    ]);
  });

  it('peeks a file that is not a zip as nothing, rather than throwing', async () => {
    await expect(
      peekZip(new File([strToU8('not a zip at all')], 'nope.zip')),
    ).resolves.toEqual({ manifest: null, names: [] });
  });

  it('stops reading once the manifest is complete', async () => {
    // The manifest sorts before media/ in every zip tool's ordering, so naming
    // a pack should cost a few kilobytes however big the pack is. Node hands a
    // Blob over in a single chunk, which would hide that, so this serves the
    // same bytes in browser-sized ones and counts what peekZip actually took.
    const bytes = zipSync({
      'manifest.json': manifest('test.pack'),
      'media/big.mp4': bulky,
    });
    let served = 0;
    const chunked = {
      size: bytes.length,
      stream: () =>
        new ReadableStream<Uint8Array>({
          pull: (controller) => {
            if (served >= bytes.length) return controller.close();
            const next = bytes.slice(served, served + 16_384);
            served += next.length;
            controller.enqueue(next);
          },
        }),
      // Only the two members peekZip uses; a real File can't be chunked.
    } as unknown as File;

    expect((await peekZip(chunked)).manifest).not.toBeNull();
    expect(served).toBeLessThan(bytes.length / 10);
  });
});
