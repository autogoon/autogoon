// What reaches the validator and the zip from a pack source on disk. The walk's
// whole job is the filesystem, so it is exercised against a real directory;
// judging the paths it returns is parsePack's, and pack.test.ts's.
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectPackFiles } from './goonpack-source';

let dir: string;

function write(path: string, text = ''): void {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goonpack-source-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('collectPackFiles', () => {
  it('lists every file the source holds, including one that has no place in a pack', () => {
    write('manifest.json', '{}');
    write('system-prompt.md', 'You are Testy.');
    write('media/a.jpg', 'bytes');
    write('notes.md', 'scratch');
    const files = collectPackFiles(dir);
    expect(Object.keys(files).sort()).toEqual([
      'manifest.json',
      'media/a.jpg',
      'notes.md',
      'system-prompt.md',
    ]);
    expect(Buffer.from(files['media/a.jpg']!).toString()).toBe('bytes');
  });

  it('keeps the media files that sort after a subfolder, and names the subfolder by its contents', () => {
    // The defect: readFileSync throws EISDIR on a directory, which ended the
    // collection and dropped every file sorting after it — with a subfolder
    // sorting first, that was the pack's whole media set.
    write('manifest.json', '{}');
    write('media/aaa-sub/x.jpg');
    write('media/b.jpg');
    write('media/c.mp4');
    expect(Object.keys(collectPackFiles(dir)).sort()).toEqual([
      'manifest.json',
      'media/aaa-sub/x.jpg',
      'media/b.jpg',
      'media/c.mp4',
    ]);
  });

  it('leaves macOS junk out, so validation never sees a file the author never made', () => {
    write('manifest.json', '{}');
    write('.DS_Store', 'junk');
    write('media/a.jpg');
    write('media/._a.jpg', 'junk');
    write('__MACOSX/._manifest.json', 'junk');
    expect(Object.keys(collectPackFiles(dir)).sort()).toEqual([
      'manifest.json',
      'media/a.jpg',
    ]);
  });
});
