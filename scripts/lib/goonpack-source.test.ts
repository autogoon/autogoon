// What reaches the validator and the zip from a pack source on disk. The walk's
// whole job is the filesystem, so it is exercised against a real directory;
// judging the paths it returns is parsePack's, and pack.test.ts's.
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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

  it('follows a symlinked directory, so a media set stored elsewhere on disk reaches the pack', () => {
    // The defect: readdirSync reports a symlink as a symlink whatever it points
    // at, so a symlinked media/ was read as a file and threw EISDIR.
    write('elsewhere/a.jpg', 'bytes');
    write('pack/manifest.json', '{}');
    symlinkSync(join(dir, 'elsewhere'), join(dir, 'pack/media'));
    const files = collectPackFiles(join(dir, 'pack'));
    expect(Object.keys(files).sort()).toEqual(['manifest.json', 'media/a.jpg']);
    expect(Buffer.from(files['media/a.jpg']!).toString()).toBe('bytes');
  });

  it('keeps macOS junk, so the zip carries what the directory carries', () => {
    // parsePack drops these before it judges anything, so keeping them costs no
    // verdict — and it is what makes a built zip match a hand-made one.
    write('manifest.json', '{}');
    write('.DS_Store', 'junk');
    write('media/a.jpg');
    write('media/._a.jpg', 'junk');
    expect(Object.keys(collectPackFiles(dir)).sort()).toEqual([
      '.DS_Store',
      'manifest.json',
      'media/._a.jpg',
      'media/a.jpg',
    ]);
  });
});
