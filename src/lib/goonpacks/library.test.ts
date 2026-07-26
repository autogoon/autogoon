import { describe, expect, it } from '@jest/globals';
import { companionList } from '@/lib/companions/companions';
import { buildLibrary, type LibrarySource } from './library';
import type { PackTree } from './pack';

const BUILT_IN = companionList[0]!.id;

const manifest = (extra: object) =>
  JSON.stringify({
    format: 2,
    version: '1.0.0',
    aboutThePack: 'a test pack',
    ...extra,
  });

// A source over plain objects: key → { path → text }. Media files are listed by
// name and never read, exactly as OPFS backs it.
function source(trees: Record<string, Record<string, string>>): LibrarySource {
  return {
    listKeys: () => Promise.resolve(Object.keys(trees)),
    openTree: (key) => {
      const files = trees[key];
      if (files === undefined) return Promise.resolve(null);
      const tree: PackTree = {
        names: Object.keys(files),
        readText: (path) => Promise.resolve(files[path] ?? ''),
      };
      return Promise.resolve(tree);
    },
    mediaUrl: (key, media) => Promise.resolve(`blob:${key}/${media.file}`),
  };
}

const completePack = (id: string) => ({
  'manifest.json': manifest({ id, companion: { name: 'Testy', voiceId: 'v' } }),
  'system-prompt.md': 'You are Testy.',
  'media/a.jpg': '',
  'media/a.txt': 'a still',
  'media/b.mp4': '',
});

describe('buildLibrary', () => {
  it('lists a valid pack as a row, an entry and resolvable content', async () => {
    const lib = await buildLibrary(
      source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
    );
    expect(lib.rows).toHaveLength(1);
    expect(lib.rows[0]).toMatchObject({
      id: 'pub.comp@1.0.0',
      summary: { media: { images: 1, videos: 1 }, hasPrompt: true },
    });
    expect(lib.rows[0]!.incompatible).toBeUndefined();
    expect(lib.entries.some((e) => e.companion.id === 'pub.comp')).toBe(true);
    const content = lib.content.get('pub.comp@1.0.0')!;
    expect(content.media.map((m) => m.ref)).toEqual([
      'goonpack:pub.comp@1.0.0/a',
      'goonpack:pub.comp@1.0.0/b',
    ]);
    expect(content.media[1]!.kind).toBe('video');
  });

  it('mints a media URL only when load() is called, then memoises it', async () => {
    const lib = await buildLibrary(
      source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
    );
    const item = lib.content.get('pub.comp@1.0.0')!.media[0]!;
    expect(item.src).toBeUndefined();
    expect(await item.load()).toBe('blob:pub.comp@1.0.0/a.jpg');
    expect(item.src).toBe('blob:pub.comp@1.0.0/a.jpg');
    expect(await item.load()).toBe('blob:pub.comp@1.0.0/a.jpg');
  });

  it('rejects a tree whose manifest disagrees with its directory name', async () => {
    const lib = await buildLibrary(
      source({ 'wrong.key@9.9.9': completePack('pub.comp') }),
    );
    expect(lib.rows[0]!.incompatible).toEqual([
      "The pack's id and version don't match the pack it was imported as.",
    ]);
    expect(lib.content.size).toBe(0);
  });

  it('lists an invalid pack as incompatible, described from its manifest peek', async () => {
    const lib = await buildLibrary(
      source({
        'pub.broken@1.0.0': {
          'manifest.json': JSON.stringify({
            format: 'bad',
            id: 'pub.broken',
            version: '1.0.0',
            companion: { name: 'Broken' },
          }),
        },
      }),
    );
    expect(lib.rows[0]!.peek).toEqual({ name: 'Broken', version: '1.0.0' });
    expect(lib.rows[0]!.incompatible).toHaveLength(1);
  });

  it("holds back an overlay whose base isn't installed, and heals when it is", async () => {
    const overlay = {
      'manifest.json': manifest({
        id: 'pub.goth',
        base: 'pub.comp',
        companion: { voiceId: 'v2' },
      }),
    };
    const alone = await buildLibrary(source({ 'pub.goth@1.0.0': overlay }));
    expect(alone.rows[0]!.incompatible).toEqual([
      "This overlay changes pub.comp, which isn't installed — import that pack first.",
    ]);
    const healed = await buildLibrary(
      source({
        'pub.goth@1.0.0': overlay,
        'pub.comp@1.0.0': completePack('pub.comp'),
      }),
    );
    expect(healed.rows.every((r) => r.incompatible === undefined)).toBe(true);
  });

  it("rejects a complete pack squatting a built-in's id", async () => {
    const lib = await buildLibrary(
      source({ [`${BUILT_IN}@1.0.0`]: completePack(BUILT_IN) }),
    );
    expect(lib.rows[0]!.incompatible).toEqual([
      "The pack's id belongs to a built-in companion — pick a different id.",
    ]);
  });

  it('rejects an overlay laid on another overlay', async () => {
    const lib = await buildLibrary(
      source({
        'pub.a@1.0.0': {
          'manifest.json': manifest({ id: 'pub.a', base: BUILT_IN }),
        },
        'pub.b@1.0.0': {
          'manifest.json': manifest({ id: 'pub.b', base: 'pub.a' }),
        },
      }),
    );
    const b = lib.rows.find((r) => r.id === 'pub.b@1.0.0')!;
    expect(b.incompatible).toEqual([
      'The base must be a complete companion, not another overlay.',
    ]);
  });

  it('rejects versions of one id that disagree about being an overlay', async () => {
    const lib = await buildLibrary(
      source({
        'pub.x@1.0.0': completePack('pub.x'),
        'pub.x@2.0.0': {
          'manifest.json': manifest({
            id: 'pub.x',
            version: '2.0.0',
            base: BUILT_IN,
          }),
        },
      }),
    );
    expect(lib.rows.every((r) => r.incompatible !== undefined)).toBe(true);
  });

  it('sorts rows by id then version ascending', async () => {
    const lib = await buildLibrary(
      source({
        'pub.b@1.0.0': completePack('pub.b'),
        'pub.a@2.0.0': completePack('pub.a'),
        'pub.a@1.0.0': completePack('pub.a'),
      }),
    );
    expect(lib.rows.map((r) => r.id)).toEqual([
      'pub.a@1.0.0',
      'pub.a@2.0.0',
      'pub.b@1.0.0',
    ]);
  });

  it('drops a key whose tree has vanished', async () => {
    const src = source({ 'pub.comp@1.0.0': completePack('pub.comp') });
    const lib = await buildLibrary({
      ...src,
      listKeys: () => Promise.resolve(['pub.comp@1.0.0', 'gone.pack@1.0.0']),
    });
    expect(lib.rows.map((r) => r.id)).toEqual(['pub.comp@1.0.0']);
  });
});
