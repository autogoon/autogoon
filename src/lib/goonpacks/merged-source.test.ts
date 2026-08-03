// Which of two sources answers for a key, and what happens when both offer one.
// What either source reads is its own file's; this covers only the routing and
// the clash.
import { describe, expect, it } from '@jest/globals';
import type { LibrarySource } from './library';
import { mergedSource } from './merged-source';
import type { PackTree, ParsedMedia } from './pack';

// A source over a set of keys, naming itself in everything it hands back, so a
// test can say which one answered.
function named(name: string, keys: string[]): LibrarySource {
  return {
    listKeys: () => Promise.resolve(keys),
    openTree: (key) =>
      Promise.resolve<PackTree | null>(
        keys.includes(key)
          ? { names: [`${name}.json`], readText: () => Promise.resolve(name) }
          : null,
      ),
    mediaUrl: (key, media) => Promise.resolve(`${name}:${key}/${media.file}`),
  };
}

const media: ParsedMedia = {
  name: 'a',
  file: 'a.jpg',
  kind: 'image',
  mimeType: 'image/jpeg',
  caption: 'a still',
  description: 'A still.',
  values: {},
};

describe('mergedSource', () => {
  it('lists every key either source holds, so one pass judges them together', async () => {
    const { source } = mergedSource(
      named('disk', ['pub.a@1.0.0']),
      named('opfs', ['pub.b@1.0.0']),
    );
    expect((await source.listKeys()).sort()).toEqual([
      'pub.a@1.0.0',
      'pub.b@1.0.0',
    ]);
  });

  it('lists a key both hold once', async () => {
    const { source } = mergedSource(
      named('disk', ['pub.a@1.0.0']),
      named('opfs', ['pub.a@1.0.0']),
    );
    expect(await source.listKeys()).toEqual(['pub.a@1.0.0']);
  });

  it('reads a shadowed key off disk, since that is the pack being worked on', async () => {
    const { source } = mergedSource(
      named('disk', ['pub.a@1.0.0']),
      named('opfs', ['pub.a@1.0.0']),
    );
    await source.listKeys();
    const tree = await source.openTree('pub.a@1.0.0');
    expect(await tree!.readText('anything')).toBe('disk');
    expect(await source.mediaUrl('pub.a@1.0.0', media)).toBe(
      'disk:pub.a@1.0.0/a.jpg',
    );
  });

  it('sends a key only the installed source holds back to it', async () => {
    const { source } = mergedSource(
      named('disk', ['pub.a@1.0.0']),
      named('opfs', ['pub.b@1.0.0']),
    );
    await source.listKeys();
    const tree = await source.openTree('pub.b@1.0.0');
    expect(await tree!.readText('anything')).toBe('opfs');
    expect(await source.mediaUrl('pub.b@1.0.0', media)).toBe(
      'opfs:pub.b@1.0.0/a.jpg',
    );
  });

  it('names the keys disk shadowed, and only those', async () => {
    const { source, clashed } = mergedSource(
      named('disk', ['pub.a@1.0.0', 'pub.c@1.0.0']),
      named('opfs', ['pub.a@1.0.0', 'pub.b@1.0.0']),
    );
    await source.listKeys();
    expect(clashed()).toEqual(['pub.a@1.0.0']);
  });

  it('names no clash before anything has been listed, so nothing is removed on a listing that never ran', () => {
    const { clashed } = mergedSource(
      named('disk', ['pub.a@1.0.0']),
      named('opfs', ['pub.a@1.0.0']),
    );
    expect(clashed()).toEqual([]);
  });

  it('forgets a clash that a later listing no longer finds', async () => {
    let onDisk = ['pub.a@1.0.0'];
    const disk: LibrarySource = {
      ...named('disk', []),
      listKeys: () => Promise.resolve(onDisk),
    };
    const { source, clashed } = mergedSource(
      disk,
      named('opfs', ['pub.a@1.0.0']),
    );
    await source.listKeys();
    expect(clashed()).toEqual(['pub.a@1.0.0']);
    onDisk = [];
    await source.listKeys();
    expect(clashed()).toEqual([]);
  });

  it('opens nothing for a key neither source listed', async () => {
    const { source } = mergedSource(named('disk', []), named('opfs', []));
    await source.listKeys();
    expect(await source.openTree('pub.gone@1.0.0')).toBeNull();
    await expect(source.mediaUrl('pub.gone@1.0.0', media)).rejects.toThrow(
      /pub.gone/,
    );
  });
});
