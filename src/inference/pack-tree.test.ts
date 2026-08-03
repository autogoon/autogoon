// A pack source read as a tree. The walk itself is pack-source.test.ts's and
// which files a pack ships is pack-contents.test.ts's; what this decides is
// which of those come back with their text, and under whose name.
//
// Against a real directory, since reading one is the whole job — a temp one,
// because packTree is handed a directory rather than finding it, and the route
// is what resolves a pack name to a path under goonpacks/.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { packTree } from './pack-tree';

const BASELINE = '2026-08-02-baseline';

let dir: string;

function write(path: string, text = ''): void {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

const sidecar = (caption: string, description: string) =>
  `---\ncaption: "${caption}"\n---\n\n${description}\n`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pack-tree-'));
  write('manifest.json', '{"format":1}');
  write('system-prompt.md', 'You are Testy.');
  write('media/a.jpg', 'bytes');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('packTree', () => {
  it('reads the manifest, the prompt and the sidecars, and names the media without reading it', async () => {
    write('media/a.md', sidecar('a still', 'A still, at length.'));
    const tree = await packTree(dir);
    expect(tree.names.sort()).toEqual([
      'manifest.json',
      'media/a.jpg',
      'media/a.md',
      'system-prompt.md',
    ]);
    expect(tree.texts['system-prompt.md']).toBe('You are Testy.');
    expect(tree.texts['media/a.md']).toContain('a still');
    expect(tree.texts).not.toHaveProperty('media/a.jpg');
  });

  it('takes an item’s description from the named experiment, under the name a pack reads', async () => {
    write('media/a.md', sidecar('by hand', 'Written by hand.'));
    write(
      `media/a.${BASELINE}.sidecar.md`,
      sidecar('inferred', 'Written by the experiment.'),
    );
    const tree = await packTree(dir, BASELINE);
    expect(tree.names).toContain('media/a.md');
    expect(tree.names).not.toContain(`media/a.${BASELINE}.sidecar.md`);
    expect(tree.texts['media/a.md']).toContain('inferred');
  });

  it('leaves out an item the named experiment has not described, hand-written sidecar or not', async () => {
    write('media/a.md', sidecar('by hand', 'Written by hand.'));
    const tree = await packTree(dir, BASELINE);
    expect(tree.names).not.toContain('media/a.jpg');
    expect(tree.names).not.toContain('media/a.md');
  });

  it('leaves out media nothing has described, whose bytes would buy nothing', async () => {
    const tree = await packTree(dir);
    expect(tree.names).not.toContain('media/a.jpg');
  });

  it('leaves the working files an experiment writes beside an item out of the tree', async () => {
    write('media/a.md', sidecar('a still', 'A still, at length.'));
    write(`media/a.${BASELINE}.raw.txt`, 'the reply');
    write(`media/a.${BASELINE}.prompt.txt`, 'the prompt');
    const tree = await packTree(dir);
    expect(tree.names.filter((n) => n.includes(BASELINE))).toEqual([]);
  });
});
