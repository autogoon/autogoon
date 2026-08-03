// What the disk source makes of the pack-tree route's answers. The route's own
// answers are pack-tree.test.ts's, and what a tree validates to is
// library.test.ts's; this covers the three methods buildLibrary calls and what
// each one asks the network for.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { diskSource } from './disk-source';
import type { ParsedMedia } from './pack';

const tree = (id: string, version = '1.0.0') => ({
  names: ['manifest.json', 'media/a.jpg', 'media/a.md'],
  texts: {
    'manifest.json': JSON.stringify({ format: 1, id, version }),
    'media/a.md': `---\ncaption: "a still"\n---\n\nA still.\n`,
  },
});

// Every URL asked for, in order, so a test can say how many requests a pack
// cost as well as what came back.
let asked: string[] = [];

function serve(answers: Record<string, object | null>): void {
  asked = [];
  const fake = (url: string): Promise<Response> => {
    asked.push(url);
    const body = answers[new URL(url, 'http://x').searchParams.get('pack')!];
    return Promise.resolve(
      body === undefined || body === null
        ? new Response('no', { status: 400 })
        : Response.json(body),
    );
  };
  globalThis.fetch = fake as unknown as typeof fetch;
}

const media = (file: string): ParsedMedia => ({
  name: 'a',
  file,
  kind: 'image',
  mimeType: 'image/jpeg',
  caption: 'a still',
  description: 'A still.',
  values: {},
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('diskSource', () => {
  it('names each pack by the key its own manifest claims', async () => {
    serve({ one: tree('pub.one'), two: tree('pub.two', '2.0.0') });
    const keys = await diskSource([{ dir: 'one' }, { dir: 'two' }]).listKeys();
    expect(keys.sort()).toEqual(['pub.one@1.0.0', 'pub.two@2.0.0']);
  });

  it('asks for the chosen experiment’s descriptions, since a source has several', async () => {
    serve({ one: tree('pub.one') });
    await diskSource([
      { dir: 'one', experiment: '2026-08-02-baseline' },
    ]).listKeys();
    expect(asked[0]).toContain('experiment=2026-08-02-baseline');
  });

  it('names no experiment when none was chosen, taking the hand-written sidecars', async () => {
    serve({ one: tree('pub.one') });
    await diskSource([{ dir: 'one' }]).listKeys();
    expect(asked[0]).not.toContain('experiment=');
  });

  it('reads a pack once however many of its files are opened', async () => {
    serve({ one: tree('pub.one') });
    const source = diskSource([{ dir: 'one' }]);
    await source.listKeys();
    const opened = await source.openTree('pub.one@1.0.0');
    await opened!.readText('manifest.json');
    await opened!.readText('media/a.md');
    expect(asked).toHaveLength(1);
  });

  it('leaves out a directory whose manifest it cannot read, which is not a pack', async () => {
    serve({ one: tree('pub.one'), two: { names: [], texts: {} } });
    const keys = await diskSource([{ dir: 'one' }, { dir: 'two' }]).listKeys();
    expect(keys).toEqual(['pub.one@1.0.0']);
  });

  it('leaves out a directory the route refused rather than failing the listing', async () => {
    serve({ one: tree('pub.one'), gone: null });
    const keys = await diskSource([{ dir: 'one' }, { dir: 'gone' }]).listKeys();
    expect(keys).toEqual(['pub.one@1.0.0']);
  });

  it('gives an empty text for a name the tree carries but never sent, which is media', async () => {
    serve({ one: tree('pub.one') });
    const source = diskSource([{ dir: 'one' }]);
    await source.listKeys();
    const opened = await source.openTree('pub.one@1.0.0');
    expect(await opened!.readText('media/a.jpg')).toBe('');
  });

  it('opens nothing for a key that was not in the listing', async () => {
    serve({ one: tree('pub.one') });
    const source = diskSource([{ dir: 'one' }]);
    await source.listKeys();
    expect(await source.openTree('pub.other@1.0.0')).toBeNull();
  });

  // The directory a pack sits in is not its key, and needs escaping where the
  // key would not: this manifest says pub.one@1.0.0 while the directory it was
  // read from is called something else, with a space in it.
  it('points media at the directory it was read from rather than at its key', async () => {
    serve({ 'a source dir': tree('pub.one') });
    const source = diskSource([{ dir: 'a source dir' }]);
    await source.listKeys();
    expect(await source.mediaUrl('pub.one@1.0.0', media('a.jpg'))).toBe(
      '/api/inference/media?pack=a%20source%20dir&file=a.jpg',
    );
  });

  it('refuses a media url for a pack that was not listed', async () => {
    serve({ one: tree('pub.one') });
    const source = diskSource([{ dir: 'one' }]);
    await source.listKeys();
    await expect(
      source.mediaUrl('pub.gone@1.0.0', media('a.jpg')),
    ).rejects.toThrow(/pub.gone/);
  });
});
