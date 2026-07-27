import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { companionList } from '@/lib/companions/companions';
import { buildLibrary, carryMediaOver, type LibrarySource } from './library';
import type { PackTree } from './pack';

const BUILT_IN = companionList[0]!.id;

const manifest = (extra: object) =>
  JSON.stringify({
    format: 2,
    version: '1.0.0',
    aboutThePack: 'a test pack',
    ...extra,
  });

// A source over plain objects: key → { path → text }. `readText` covers
// manifest.json, system-prompt.md and the caption sidecars — the only files
// parsePack opens — so the .jpg/.mp4 entries carry empty text, and `mediaUrl`
// stands in for reading their bytes.
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
    // Rejects for a pack that has left the trees, as the OPFS-backed source
    // does when the file it would open has gone with its pack.
    mediaUrl: (key, media) =>
      trees[key] === undefined
        ? Promise.reject(new Error(`missing media: ${key}/${media.file}`))
        : Promise.resolve(`blob:${key}/${media.file}`),
  };
}

const completePack = (id: string) => ({
  'manifest.json': manifest({ id, companion: { name: 'Testy', voiceId: 'v' } }),
  'system-prompt.md': 'You are Testy.',
  'media/a.jpg': '',
  'media/a.txt': 'a still',
  'media/b.mp4': '',
});

const overlayPack = (id: string, base: string) => ({
  'manifest.json': manifest({ id, base, companion: { voiceId: 'v2' } }),
  'media/a.jpg': '',
  'media/a.txt': 'a still',
  'media/b.mp4': '',
});

describe('buildLibrary', () => {
  it("builds a row carrying the pack's media counts and prompt flag", async () => {
    const lib = await buildLibrary(
      source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
    );
    expect(lib.rows).toHaveLength(1);
    expect(lib.rows[0]).toMatchObject({
      id: 'pub.comp@1.0.0',
      summary: { media: { images: 1, videos: 1 }, hasPrompt: true },
    });
    expect(lib.rows[0]!.incompatible).toBeUndefined();
  });

  it('builds a chooser entry for a complete pack', async () => {
    const lib = await buildLibrary(
      source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
    );
    expect(lib.entries.some((e) => e.companion.id === 'pub.comp')).toBe(true);
  });

  it('keys the manifests map by id@version, so an import can tell an upgrade from a new pack', async () => {
    const lib = await buildLibrary(
      source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
    );
    expect([...lib.manifests.keys()]).toEqual(['pub.comp@1.0.0']);
  });

  it('gives each media file a stable goonpack: ref, its kind and its sidecar caption', async () => {
    const lib = await buildLibrary(
      source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
    );
    const content = lib.content.get('pub.comp@1.0.0')!;
    expect(content.media.map((m) => m.ref)).toEqual([
      'goonpack:pub.comp@1.0.0/a',
      'goonpack:pub.comp@1.0.0/b',
    ]);
    expect(content.media[1]!.kind).toBe('video');
    expect(content.media[0]!.description).toBe('a still');
  });

  it("leaves a media item's src unset until load() is called", async () => {
    const lib = await buildLibrary(
      source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
    );
    const item = lib.content.get('pub.comp@1.0.0')!.media[0]!;
    expect(item.src).toBeUndefined();
    expect(await item.load()).toBe('blob:pub.comp@1.0.0/a.jpg');
    expect(item.src).toBe('blob:pub.comp@1.0.0/a.jpg');
  });

  it('mints one URL per media item however often load() is called', async () => {
    // The app's mediaUrl is URL.createObjectURL (use-goonpack-library.ts),
    // which mints a fresh URL per call, so this fake mints uniquely too: an
    // unmemoised load() would leak one object URL per render.
    let mints = 0;
    const lib = await buildLibrary({
      ...source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
      mediaUrl: (key, media) =>
        Promise.resolve(`blob:${++mints}:${key}/${media.file}`),
    });
    const item = lib.content.get('pub.comp@1.0.0')!.media[0]!;
    expect(await item.load()).toBe('blob:1:pub.comp@1.0.0/a.jpg');
    expect(await item.load()).toBe('blob:1:pub.comp@1.0.0/a.jpg');
    expect(mints).toBe(1);
  });

  it('retries a media URL that failed once, rather than pinning it as missing', async () => {
    const src = source({ 'pub.comp@1.0.0': completePack('pub.comp') });
    let fail = true;
    const lib = await buildLibrary({
      ...src,
      mediaUrl: (key, media) => {
        if (!fail) return src.mediaUrl(key, media);
        fail = false;
        return Promise.reject(new Error('unreadable'));
      },
    });
    const item = lib.content.get('pub.comp@1.0.0')!.media[0]!;
    await expect(item.load()).rejects.toThrow('unreadable');
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
    expect(lib.rows[0]!.incompatible).toEqual([
      'manifest.json is missing the format field — add "format": 2.',
    ]);
  });

  it("holds back an overlay whose base isn't installed", async () => {
    const lib = await buildLibrary(
      source({ 'pub.goth@1.0.0': overlayPack('pub.goth', 'pub.comp') }),
    );
    expect(lib.rows[0]!.incompatible).toEqual([
      "This overlay changes pub.comp, which isn't installed — import that pack first.",
    ]);
  });

  it('offers a held-back overlay once its base is installed too', async () => {
    const lib = await buildLibrary(
      source({
        'pub.goth@1.0.0': overlayPack('pub.goth', 'pub.comp'),
        'pub.comp@1.0.0': completePack('pub.comp'),
      }),
    );
    expect(lib.rows.map((r) => [r.id, r.incompatible])).toEqual([
      ['pub.comp@1.0.0', undefined],
      ['pub.goth@1.0.0', undefined],
    ]);
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

  it('marks every version of an id incompatible when one is an overlay and another is complete', async () => {
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
    const disagree = [
      'Installed versions of this id disagree about being an overlay or a complete companion.',
    ];
    expect(lib.rows.map((r) => [r.id, r.incompatible])).toEqual([
      ['pub.x@1.0.0', disagree],
      ['pub.x@2.0.0', disagree],
    ]);
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

describe('carryMediaOver', () => {
  // Revoking is unobservable, so the stub records which URLs the reconciliation
  // decides to revoke.
  const revoked: string[] = [];
  const real = URL.revokeObjectURL;
  beforeEach(() => {
    revoked.length = 0;
    URL.revokeObjectURL = (url: string) => revoked.push(url) as unknown as void;
  });
  afterEach(() => {
    URL.revokeObjectURL = real;
  });

  const twoPacks = () =>
    source({
      'pub.a@1.0.0': completePack('pub.a'),
      'pub.b@1.0.0': completePack('pub.b'),
    });
  const loadAll = async (lib: Awaited<ReturnType<typeof buildLibrary>>) => {
    for (const content of lib.content.values()) {
      for (const m of content.media) await m.load();
    }
  };

  it('carries a still-installed pack across, URLs and entry objects intact', async () => {
    const before = await buildLibrary(twoPacks());
    await loadAll(before);
    const carried = before.content.get('pub.a@1.0.0')!.media[0]!;

    const after = await buildLibrary(twoPacks());
    carryMediaOver(before, after, new Set());

    expect(revoked).toEqual([]);
    // The same entry object, so a Companion resolved before the rebuild is
    // still holding a live URL.
    expect(after.content.get('pub.a@1.0.0')!.media[0]).toBe(carried);
    expect(after.content.get('pub.a@1.0.0')!.media[0]!.src).toBe(
      'blob:pub.a@1.0.0/a.jpg',
    );
  });

  it('revokes only the pack that is gone from the new index', async () => {
    const before = await buildLibrary(twoPacks());
    await loadAll(before);

    const after = await buildLibrary(
      source({ 'pub.a@1.0.0': completePack('pub.a') }),
    );
    carryMediaOver(before, after, new Set());

    expect(revoked.sort()).toEqual([
      'blob:pub.b@1.0.0/a.jpg',
      'blob:pub.b@1.0.0/b.mp4',
    ]);
    expect(after.content.get('pub.a@1.0.0')!.media[0]!.src).toBe(
      'blob:pub.a@1.0.0/a.jpg',
    );
  });

  it('clears the URL it revoked, so a thread still holding the entry re-reads it', async () => {
    const trees: Record<string, Record<string, string>> = {
      'pub.a@1.0.0': completePack('pub.a'),
      'pub.b@1.0.0': completePack('pub.b'),
    };
    const shared = source(trees);
    const before = await buildLibrary(shared);
    await loadAll(before);
    // What a Companion resolved before the removal goes on holding.
    const held = before.content.get('pub.b@1.0.0')!.media[0]!;

    delete trees['pub.b@1.0.0'];
    carryMediaOver(before, await buildLibrary(shared), new Set());

    expect(held.src).toBeUndefined();
    await expect(held.load()).rejects.toThrow('missing media');
  });

  it('revokes a pack whose tree was just replaced', async () => {
    const before = await buildLibrary(twoPacks());
    await loadAll(before);

    const after = await buildLibrary(twoPacks());
    carryMediaOver(before, after, new Set(['pub.a@1.0.0']));

    expect(revoked.sort()).toEqual([
      'blob:pub.a@1.0.0/a.jpg',
      'blob:pub.a@1.0.0/b.mp4',
    ]);
    // Re-imported: fresh entries, nothing minted yet.
    expect(after.content.get('pub.a@1.0.0')!.media[0]!.src).toBeUndefined();
    expect(after.content.get('pub.b@1.0.0')!.media[0]!.src).toBe(
      'blob:pub.b@1.0.0/a.jpg',
    );
  });

  it('keeps a pack that only became incompatible, so on-screen media survives', async () => {
    const before = await buildLibrary(
      source({
        'pub.comp@1.0.0': completePack('pub.comp'),
        'pub.goth@1.0.0': overlayPack('pub.goth', 'pub.comp'),
      }),
    );
    await loadAll(before);

    // The base is removed. The overlay is still installed — it just has nothing
    // to lay itself over, so it lists as incompatible and leaves `content`.
    const after = await buildLibrary(
      source({ 'pub.goth@1.0.0': overlayPack('pub.goth', 'pub.comp') }),
    );
    expect(after.content.has('pub.goth@1.0.0')).toBe(false);
    expect(after.rows.map((r) => r.id)).toEqual(['pub.goth@1.0.0']);
    carryMediaOver(before, after, new Set());

    // Only the pack that actually went is revoked: a thread bubble holding the
    // overlay's media still has a URL that renders.
    expect(revoked.sort()).toEqual([
      'blob:pub.comp@1.0.0/a.jpg',
      'blob:pub.comp@1.0.0/b.mp4',
    ]);
  });

  it('revokes a media file that has gone from a carried-over pack', async () => {
    const before = await buildLibrary(twoPacks());
    await loadAll(before);

    const { 'media/b.mp4': _gone, ...trimmed } = completePack('pub.a');
    const after = await buildLibrary(
      source({ 'pub.a@1.0.0': trimmed, 'pub.b@1.0.0': completePack('pub.b') }),
    );
    carryMediaOver(before, after, new Set());

    expect(revoked).toEqual(['blob:pub.a@1.0.0/b.mp4']);
    expect(after.content.get('pub.a@1.0.0')!.media[0]!.src).toBe(
      'blob:pub.a@1.0.0/a.jpg',
    );
  });
});
