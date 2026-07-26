import { describe, expect, it } from '@jest/globals';
import { PackError } from './manifest';
import { parsePack, peekManifest, type PackTree } from './pack';

const manifest = (extra: object = {}) =>
  JSON.stringify({
    format: 2,
    id: 'test.pack',
    version: '1.0.0',
    aboutThePack: 'a test pack',
    ...extra,
  });
const complete = (extra: object = {}) =>
  manifest({ companion: { name: 'Testy', voiceId: 'v123' }, ...extra });

// An in-memory PackTree: file contents by path. Media files hold '' — parsePack
// must never read them, and a test that made it read one would still pass on
// content but is caught by the "never reads media" test below.
function tree(files: Record<string, string>): PackTree & { read: string[] } {
  const read: string[] = [];
  return {
    names: Object.keys(files),
    read,
    readText: (path: string) => {
      read.push(path);
      const v = files[path];
      if (v === undefined) return Promise.reject(new Error(`no ${path}`));
      return Promise.resolve(v);
    },
  };
}

describe('parsePack', () => {
  it('parses a complete pack with stills, videos and captions', async () => {
    const t = tree({
      'manifest.json': complete(),
      'system-prompt.md': 'You are Testy.',
      'media/a.jpg': '',
      'media/a.txt': 'desc a\n',
      'media/b.png': '',
      'media/c.mp4': '',
      'media/c.txt': 'a video',
    });
    const pack = await parsePack(t);
    expect(pack.manifest.id).toBe('test.pack');
    expect(pack.systemPrompt).toBe('You are Testy.');
    expect(pack.media).toHaveLength(3);
    expect(pack.media[0]).toEqual({
      name: 'a',
      file: 'a.jpg',
      kind: 'image',
      mimeType: 'image/jpeg',
      description: 'desc a',
    });
    expect(pack.media[1]).toMatchObject({ name: 'b', description: '' });
    expect(pack.media[2]).toMatchObject({
      name: 'c',
      kind: 'video',
      mimeType: 'video/mp4',
      description: 'a video',
    });
  });

  it('never reads a media file', async () => {
    const t = tree({
      'manifest.json': complete(),
      'system-prompt.md': 'x',
      'media/a.jpg': '',
      'media/a.txt': 'cap',
      'media/big.mp4': '',
    });
    await parsePack(t);
    expect(t.read.sort()).toEqual([
      'manifest.json',
      'media/a.txt',
      'system-prompt.md',
    ]);
  });

  it('accepts an overlay with nothing but a manifest', async () => {
    const pack = await parsePack(
      tree({ 'manifest.json': manifest({ base: 'autogoon.aimee' }) }),
    );
    expect(pack.media).toEqual([]);
  });

  it('rejects .mov by name, saying why', async () => {
    const t = tree({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'media/video.mov': '',
    });
    await expect(parsePack(t)).rejects.toThrow(/\.mov/);
    await expect(parsePack(t)).rejects.toThrow(/mp4 or \.webm/);
  });

  it('rejects unsupported files and subfolders under media/', async () => {
    const t = tree({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'media/a.gif': '',
      'media/sub/b.jpg': '',
    });
    const problems = await parsePack(t).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      'Unsupported file in media/: a.gif — media must be jpg, jpeg, png, webp, mp4 or webm, with captions in matching .txt files.',
      "media/ can't contain subfolders — found media/sub/b.jpg.",
    ]);
  });

  it('rejects duplicate stems across extensions', async () => {
    const t = tree({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'media/a.jpg': '',
      'media/a.mp4': '',
    });
    await expect(parsePack(t)).rejects.toThrow(/share the name/);
  });

  it('rejects noMedia alongside a media/ folder', async () => {
    await expect(
      parsePack(
        tree({
          'manifest.json': manifest({
            base: 'autogoon.aimee',
            noMedia: true,
          }),
          'media/a.jpg': '',
        }),
      ),
    ).rejects.toThrow(/noMedia/);
    const clean = await parsePack(
      tree({
        'manifest.json': manifest({ base: 'autogoon.aimee', noMedia: true }),
      }),
    );
    expect(clean.manifest.noMedia).toBe(true);
  });

  it('rejects a complete pack missing prompt/name/voiceId', async () => {
    await expect(
      parsePack(tree({ 'manifest.json': complete() })),
    ).rejects.toThrow(/system-prompt/);
    await expect(
      parsePack(
        tree({
          'manifest.json': manifest({ companion: { voiceId: 'v' } }),
          'system-prompt.md': 'x',
        }),
      ),
    ).rejects.toThrow(PackError);
  });

  it('accepts a format 1 pack that carries no media', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': JSON.stringify({
          format: 1,
          id: 'test.pack',
          version: '1.0.0',
          aboutThePack: 'a colour-only overlay',
          base: 'autogoon.aimee',
          companion: { accentColour: 'cyan' },
        }),
      }),
    );
    expect(pack.media).toEqual([]);
  });

  it('names the old layout when a format 1 pack has a pictures/ folder', async () => {
    const t = tree({
      'manifest.json': JSON.stringify({
        format: 1,
        id: 'test.pack',
        version: '1.0.0',
        aboutThePack: 'an old pack',
        base: 'autogoon.aimee',
      }),
      'pictures/a.jpg': '',
      'pictures/a.txt': 'cap',
    });
    await expect(parsePack(t)).rejects.toThrow(/old pictures\/ layout/);
  });

  it('names the folder when everything landed inside one', async () => {
    const t = tree({
      'yourpack/manifest.json': complete(),
      'yourpack/media/a.jpg': '',
    });
    await expect(parsePack(t)).rejects.toThrow(
      /Everything is inside yourpack\//,
    );
  });

  it('asks for a root manifest when there is none and no single wrapper', async () => {
    await expect(
      parsePack(tree({ 'a/manifest.json': complete(), 'b/x.txt': '' })),
    ).rejects.toThrow(/No manifest.json at the pack root/);
  });

  it('ignores junk and extra files at the root', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': manifest({ base: 'autogoon.aimee' }),
        'readme.txt': 'hello',
        '.DS_Store': '',
        '__MACOSX/._manifest.json': '',
        'media/.DS_Store': '',
        'media/._a.jpg': '',
      }),
    );
    expect(pack.media).toEqual([]);
  });

  it('collects every problem it can determine in one throw', async () => {
    const problems = await parsePack(
      tree({
        'manifest.json': manifest({ companion: { name: 'Testy' } }),
        'media/a.gif': '',
      }),
    ).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      'Unsupported file in media/: a.gif — media must be jpg, jpeg, png, webp, mp4 or webm, with captions in matching .txt files.',
      'A complete pack needs a system-prompt.md file.',
      'A complete pack needs a voiceId field in the companion section of manifest.json.',
    ]);
  });

  it("reports the manifest's own problems alongside the tree's", async () => {
    const problems = await parsePack(
      tree({
        'manifest.json': manifest({
          version: undefined,
          companion: { name: 'Testy' },
        }),
        'media/a.gif': '',
      }),
    ).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      'manifest.json is missing the version field - this is the version number of your pack',
      'Unsupported file in media/: a.gif — media must be jpg, jpeg, png, webp, mp4 or webm, with captions in matching .txt files.',
    ]);
  });
});

describe('peekManifest', () => {
  it("reads the manifest's string fields from text parsePack rejects", () => {
    expect(
      peekManifest(
        JSON.stringify({
          id: 'test.pack',
          version: '0.9.0',
          companion: { name: 'Testy' },
          base: 'autogoon.aimee',
          format: 'bad',
        }),
      ),
    ).toEqual({
      name: 'Testy',
      version: '0.9.0',
      base: 'autogoon.aimee',
    });
  });
  it('ignores non-string fields and unreadable input', () => {
    // A top-level name (the pre-companion-section shape) still peeks.
    expect(peekManifest(JSON.stringify({ version: 2, name: 'Testy' }))).toEqual(
      {
        name: 'Testy',
      },
    );
    expect(peekManifest('nope')).toEqual({});
  });
});
