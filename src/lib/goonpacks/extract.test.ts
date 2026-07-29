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

// Deliberately incompressible, for the stop-reading test: it measures how much
// of the zip peekZip left unread, and a repeating fill would deflate to a few
// hundred bytes, arrive in a single chunk, and leave nothing to leave unread.
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

// level 0 stores entries instead of deflating them. fflate passes a STORED entry
// through as a window onto the archive read-chunk, so an entry's first chunk
// starts partway into it — byteOffset > 0, backed by the whole chunk — where a
// deflated entry always arrives in a fresh exact-size buffer. A default-level
// zip therefore can't catch the bug the WebKit chunk-buffer test is about, with
// or without the fix.
const storedZipFile = (files: Record<string, Uint8Array>): File =>
  new File([zipSync(files, { level: 0 })], 'pack.zip', {
    type: 'application/zip',
  });

// The zip fflate can't read. It registers a decoder for method 8 and no other,
// so an entry declaring method 99 (WinZip AES) makes entry.start() throw
// `TypeError: ctr is not a constructor` out through unzip.push() — the throw
// peekZip's own catch exists for. Bytes that simply aren't a zip
// don't throw at all, so a patched header is the only fixture that keeps that
// catch at all; without it the failure reaches the user as the panel's generic
// "Import failed." The patch is the compression-method field of the first local
// file header, 2 bytes at offset 8.
const unsupportedMethodZipFile = (): File => {
  const bytes = zipSync({ 'manifest.json': manifest('test.pack') });
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(
    8,
    99,
    true,
  );
  return new File([bytes], 'pack.zip', { type: 'application/zip' });
};

// fakeDir, but also recording the exact Uint8Array chunks handed to each file's
// writable.
function capturingDir(
  chunks: Map<string, Uint8Array[]>,
  prefix = '',
): FileSystemDirectoryHandle {
  return {
    getDirectoryHandle: (name: string) =>
      Promise.resolve(capturingDir(chunks, `${prefix}${name}/`)),
    getFileHandle: (name: string) =>
      Promise.resolve({
        createWritable: () => {
          const got: Uint8Array[] = [];
          chunks.set(`${prefix}${name}`, got);
          return Promise.resolve({
            write: (chunk: Uint8Array) => {
              got.push(chunk);
              return Promise.resolve();
            },
            close: () => Promise.resolve(),
          });
        },
      }),
  } as unknown as FileSystemDirectoryHandle;
}

describe('extractZip', () => {
  it('does not write the .DS_Store and __MACOSX/ files a Finder zip carries', async () => {
    const written = new Set<string>();
    await extractZip(
      zipFile({
        'manifest.json': manifest('test.pack'),
        '.DS_Store': strToU8('junk'),
        '__MACOSX/._manifest.json': strToU8('junk'),
        'media/a.jpg': strToU8('x'),
      }),
      fakeDir(written),
    );
    expect([...written].sort()).toEqual(['manifest.json', 'media/a.jpg']);
  });

  // The install marker is a sibling of the pack directory, so a zip entry named
  // `.complete` cannot forge it — it is an ordinary file inside the tree, and
  // parsePack refuses it by name like any other path that isn't the manifest,
  // the prompt or media/.
  it('writes a .complete entry like any other file, since the marker lives outside the tree', async () => {
    const written = new Set<string>();
    await extractZip(
      zipFile({
        'manifest.json': manifest('test.pack'),
        '.complete': strToU8('an ordinary file'),
      }),
      fakeDir(written),
    );
    expect([...written].sort()).toEqual(['.complete', 'manifest.json']);
  });

  // Found in Safari 27: WebKit's FileSystemWritableFileStream.write() writes a
  // view's ENTIRE backing buffer, ignoring byteOffset and length. Handed
  // fflate's stored-entry windows, it wrote a copy of the whole zip as every
  // file in the pack, so importing any pack failed with "manifest.json isn't
  // valid JSON". Chromium and Firefox write the window and were unaffected.
  // extract.ts copies each chunk; this pins the invariant that keeps WebKit
  // correct — every chunk reaching write() owns the whole of its buffer.
  it('gives every chunk its own buffer before it reaches write()', async () => {
    const chunks = new Map<string, Uint8Array[]>();
    await extractZip(
      storedZipFile({
        'manifest.json': manifest('test.pack'),
        'media/big.mp4': bulky,
      }),
      capturingDir(chunks),
    );

    for (const [path, parts] of chunks) {
      for (const part of parts) {
        expect({
          path,
          byteOffset: part.byteOffset,
          backing: part.buffer.byteLength,
        }).toEqual({ path, byteOffset: 0, backing: part.byteLength });
      }
    }

    const parts = chunks.get('media/big.mp4')!;
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      joined.set(p, at);
      at += p.length;
    }
    expect(joined).toEqual(bulky);
  });
});

describe('peekZip', () => {
  it("returns the root manifest's text", async () => {
    const { manifest: raw } = await peekZip(
      zipFile({
        'manifest.json': manifest('test.pack'),
        'system-prompt.md': strToU8('You are Testy.'),
        'media/big.mp4': bulky,
      }),
    );
    expect(JSON.parse(raw!)).toMatchObject({ id: 'test.pack' });
  });

  // From these names prepareImport builds "Everything is inside yourpack/ —
  // zip the folder's contents, not the folder." Without them it can only give
  // the generic "No manifest.json at the zip root", which is also what a zip
  // that isn't a pack gets, and the actual mistake goes unnamed.
  it('returns a null manifest and the names when the pack is inside a wrapper folder', async () => {
    const { manifest: raw, names } = await peekZip(
      zipFile({
        'yourpack/manifest.json': manifest('test.pack'),
        'yourpack/media/a.jpg': strToU8('x'),
      }),
    );
    expect(raw).toBeNull();
    expect(names.sort()).toEqual([
      'yourpack/manifest.json',
      'yourpack/media/a.jpg',
    ]);
  });

  // The names peek returns have to be the names extraction would write, or the
  // two disagree about the pack's shape. It matters here for wrapperFolder,
  // which counts top-level folders: __MACOSX/ is a second one, so leaving it in
  // turns the wrapper case into "no single wrapper" and the advice degrades to
  // the generic "No manifest.json at the zip root".
  it('does not return the .DS_Store and __MACOSX/ names a Finder zip carries', async () => {
    const { names } = await peekZip(
      zipFile({
        'yourpack/manifest.json': manifest('test.pack'),
        'yourpack/.DS_Store': strToU8('junk'),
        '__MACOSX/._manifest.json': strToU8('junk'),
      }),
    );
    expect(names.sort()).toEqual(['yourpack/manifest.json']);
  });

  // prepareImport turns this empty result into "No manifest.json at the zip
  // root — zip the pack folder's contents, not the folder."
  it('returns an empty result for bytes that are not a zip', async () => {
    await expect(
      peekZip(new File([strToU8('not a zip at all')], 'nope.zip')),
    ).resolves.toEqual({ manifest: null, names: [] });
  });

  it('reports no manifest for an entry compressed with a method fflate cannot read', async () => {
    await expect(peekZip(unsupportedMethodZipFile())).resolves.toEqual({
      manifest: null,
      names: ['manifest.json'],
    });
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
      stream: () =>
        new ReadableStream<Uint8Array>({
          pull: (controller) => {
            if (served >= bytes.length) return controller.close();
            const next = bytes.slice(served, served + 16_384);
            served += next.length;
            controller.enqueue(next);
          },
        }),
      // Only stream, which is all peekZip reads; a real File can't be chunked.
    } as unknown as File;

    expect((await peekZip(chunked)).manifest).not.toBeNull();
    expect(served).toBeLessThan(bytes.length / 10);
  });
});
