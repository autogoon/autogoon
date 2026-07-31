// What comes back out of an archive writeZip wrote. The writer's whole job is
// bytes from disk to disk, so it runs against a real directory and a real file;
// judging which names go in is collectPackFiles' and parsePack's.
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { writeZip } from './goonpack-zip';

let dir: string;

function write(path: string, bytes: Uint8Array): void {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, bytes);
}

const text = (s: string): Uint8Array => new Uint8Array(Buffer.from(s));

// The archive read back as fflate reads it: contents by path.
async function zipAndRead(
  names: string[],
): Promise<Record<string, Uint8Array>> {
  const out = join(dir, 'out.zip');
  await writeZip(dir, names, out);
  return unzipSync(new Uint8Array(readFileSync(out)));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goonpack-zip-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeZip', () => {
  it('writes every named file to its path in the archive, with its bytes', async () => {
    write('manifest.json', text('{"id":"test.pack"}'));
    write('media/a.jpg', text('the picture'));
    const entries = await zipAndRead(['manifest.json', 'media/a.jpg']);
    expect(Object.keys(entries).sort()).toEqual([
      'manifest.json',
      'media/a.jpg',
    ]);
    expect(Buffer.from(entries['manifest.json']!).toString()).toBe(
      '{"id":"test.pack"}',
    );
    expect(Buffer.from(entries['media/a.jpg']!).toString()).toBe('the picture');
  });

  it('writes a file larger than one read chunk whole', async () => {
    // A read stream hands this over in several data events, so a chunk pushed
    // to the wrong entry — or dropped — shows up as bytes that don't match.
    // Pseudo-random rather than repeated, which deflate would collapse to
    // almost nothing whatever was lost.
    const big = new Uint8Array(300_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761) % 256;
    write('media/big.mp4', big);
    const entries = await zipAndRead(['media/big.mp4']);
    expect(entries['media/big.mp4']).toEqual(big);
  });

  it('writes an empty file, which arrives with no data event at all', async () => {
    write('media/empty.jpg', new Uint8Array(0));
    write('manifest.json', text('{}'));
    const entries = await zipAndRead(['media/empty.jpg', 'manifest.json']);
    expect(entries['media/empty.jpg']).toEqual(new Uint8Array(0));
    expect(Buffer.from(entries['manifest.json']!).toString()).toBe('{}');
  });
});
