import { describe, expect, it } from '@jest/globals';
import { PackError } from './manifest';
import { parsePack, peekManifest, type PackTree } from './pack';

const manifest = (extra: object = {}) =>
  JSON.stringify({
    format: 1,
    id: 'test.pack',
    version: '1.0.0',
    aboutThePack: 'a test pack',
    ...extra,
  });
const complete = (extra: object = {}) =>
  manifest({
    companion: {
      name: 'Testy',
      description: 'a test companion',
      voiceId: 'v123',
      // Clocks are not what these cases pin, and a complete pack on real time
      // needs a zone (parsePack).
      usesRealTime: false,
    },
    ...extra,
  });

// A sidecar as the describing script writes one: the caption quoted in
// frontmatter, the long description as the body.
const sidecar = (caption: string, description: string) =>
  `---\ncaption: "${caption}"\n---\n\n${description}\n`;

// An in-memory PackTree: file contents by path. Media files hold '' — parsePack
// must never read them, and a test that made it read one would still pass on
// content but is caught by the "never reads a media file" test.
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
  it('parses a complete pack with stills, videos and both sidecar texts', async () => {
    // The media is listed out of alphabetical order deliberately: pack.media
    // comes back sorted by name from parsePack, so the index assertions
    // only hold if that sort ran.
    const t = tree({
      'manifest.json': complete({ mediaSummary: 'Beach shots.' }),
      'system-prompt.md': 'You are Testy.',
      'media/c.mp4': '',
      'media/c.md': sidecar('a video', 'She dances for a while.'),
      'media/b.png': '',
      'media/b.md': sidecar('cap b', 'Description b.'),
      'media/a.jpg': '',
      'media/a.md': sidecar('desc a', 'Description a.'),
    });
    const pack = await parsePack(t);
    expect(pack.manifest.id).toBe('test.pack');
    expect(pack.manifest.mediaSummary).toBe('Beach shots.');
    expect(pack.systemPrompt).toBe('You are Testy.');
    expect(pack.media).toHaveLength(3);
    expect(pack.media[0]).toEqual({
      name: 'a',
      file: 'a.jpg',
      kind: 'image',
      mimeType: 'image/jpeg',
      caption: 'desc a',
      description: 'Description a.',
    });
    expect(pack.media[1]).toMatchObject({
      name: 'b',
      caption: 'cap b',
      description: 'Description b.',
    });
    expect(pack.media[2]).toMatchObject({
      name: 'c',
      kind: 'video',
      mimeType: 'video/mp4',
      caption: 'a video',
      description: 'She dances for a while.',
    });
  });

  it("reads both texts from a media item's sidecar", async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': complete({ mediaSummary: 'Beach shots.' }),
        'system-prompt.md': 'You are Testy.',
        'media/a.jpg': '',
        'media/a.md': sidecar('A caption.', 'A long description.'),
      }),
    );
    expect(pack.media[0]?.caption).toBe('A caption.');
    expect(pack.media[0]?.description).toBe('A long description.');
  });

  it('leaves a media file not described yet out of the media, rather than refusing the pack', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': complete({}),
        'system-prompt.md': 'You are Testy.',
        'media/a.jpg': '',
      }),
    );
    expect(pack.media).toEqual([]);
  });

  it('returns the described files and leaves the rest out, so media is what can be offered', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': complete({ mediaSummary: 'Beach shots.' }),
        'system-prompt.md': 'You are Testy.',
        'media/a.jpg': '',
        'media/a.md': sidecar('A caption.', 'A long description.'),
        'media/b.jpg': '',
      }),
    );
    expect(pack.media.map((m) => m.file)).toEqual(['a.jpg']);
  });

  it('refuses a sidecar whose body is empty, which is a description that went wrong rather than one not written yet', async () => {
    await expect(
      parsePack(
        tree({
          'manifest.json': complete({ mediaSummary: 'Beach shots.' }),
          'system-prompt.md': 'You are Testy.',
          'media/a.jpg': '',
          'media/a.md': '---\ncaption: "A caption."\n---\n',
        }),
      ),
    ).rejects.toThrow(/a\.md/);
  });

  it('refuses a sidecar with no media file beside it, which is half a rename', async () => {
    await expect(
      parsePack(
        tree({
          'manifest.json': complete({ mediaSummary: 'Beach shots.' }),
          'system-prompt.md': 'You are Testy.',
          'media/a.jpg': '',
          'media/a.md': sidecar('A caption.', 'A description.'),
          'media/b.md': sidecar('Orphan.', 'No picture for this one.'),
        }),
      ),
    ).rejects.toThrow(/b\.md/);
  });

  it('names the sidecar that failed to parse, not just the pack', async () => {
    await expect(
      parsePack(
        tree({
          'manifest.json': complete({ mediaSummary: 'Beach shots.' }),
          'system-prompt.md': 'You are Testy.',
          'media/a.jpg': '',
          'media/a.md': 'no frontmatter here\n',
        }),
      ),
    ).rejects.toThrow(/a\.md/);
  });

  it('refuses a pack that carries media and no summary of it', async () => {
    await expect(
      parsePack(
        tree({
          'manifest.json': complete(),
          'system-prompt.md': 'You are Testy.',
          'media/a.jpg': '',
          'media/a.md': sidecar('A caption.', 'A description.'),
        }),
      ),
    ).rejects.toThrow(/mediaSummary/);
  });

  it('accepts a pack with no media and no summary, which needs none', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': complete(),
        'system-prompt.md': 'You are Testy.',
      }),
    );
    expect(pack.media).toEqual([]);
  });

  it('never reads a media file', async () => {
    const t = tree({
      'manifest.json': complete({ mediaSummary: 'One of each.' }),
      'system-prompt.md': 'x',
      'media/a.jpg': '',
      'media/a.md': sidecar('cap', 'Description a.'),
      'media/big.mp4': '',
      'media/big.md': sidecar('a video', 'Description big.'),
    });
    await parsePack(t);
    expect(t.read.sort()).toEqual([
      'manifest.json',
      'media/a.md',
      'media/big.md',
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

  it('rejects an unsupported extension in media/, naming the file and the allowed types', async () => {
    const t = tree({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'media/a.gif': '',
    });
    const problems = await parsePack(t).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      'Unsupported file in media/: a.gif — media must be jpg, jpeg, png, webp, mp4 or webm, each with a matching .md sidecar.',
    ]);
  });

  it('rejects a subfolder under media/, naming the path', async () => {
    const t = tree({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'media/sub/b.jpg': '',
    });
    const problems = await parsePack(t).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      "media/ can't contain subfolders — found media/sub/b.jpg.",
    ]);
  });

  it('names a file that has no place in a pack rather than ignoring it', async () => {
    await expect(
      parsePack(
        tree({
          'manifest.json': complete(),
          'system-prompt.md': 'You are Testy.',
          'notes.md': 'scratch',
        }),
      ),
    ).rejects.toThrow(/notes\.md/);
  });

  it('names a stray folder by the files inside it, since a folder is only paths', async () => {
    await expect(
      parsePack(
        tree({
          'manifest.json': complete(),
          'system-prompt.md': 'You are Testy.',
          'pictures/a.jpg': '',
        }),
      ),
    ).rejects.toThrow(/pictures\/a\.jpg/);
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
  });

  it('keeps noMedia set on an overlay with no media/ folder', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': manifest({ base: 'autogoon.aimee', noMedia: true }),
      }),
    );
    expect(pack.manifest.noMedia).toBe(true);
  });

  it('rejects a complete pack with no system-prompt.md', async () => {
    await expect(
      parsePack(tree({ 'manifest.json': complete() })),
    ).rejects.toThrow(/system-prompt/);
  });

  it('rejects a complete pack whose companion has no name', async () => {
    const problems = await parsePack(
      tree({
        'manifest.json': manifest({
          companion: {
            description: 'a test companion',
            voiceId: 'v',
            usesRealTime: false,
          },
        }),
        'system-prompt.md': 'x',
      }),
    ).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      'A complete pack needs a name field in the companion section of manifest.json.',
    ]);
  });

  it('rejects a complete pack whose companion has no description', async () => {
    const problems = await parsePack(
      tree({
        'manifest.json': manifest({
          companion: { name: 'Testy', voiceId: 'v', usesRealTime: false },
        }),
        'system-prompt.md': 'x',
      }),
    ).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      'A complete pack needs a description field in the companion section of manifest.json.',
    ]);
  });

  it('rejects a complete pack on real time with no timezone', async () => {
    await expect(
      parsePack(
        tree({
          'manifest.json': manifest({
            companion: {
              name: 'Testy',
              description: 'a test companion',
              voiceId: 'v',
            },
          }),
          'system-prompt.md': 'x',
        }),
      ),
    ).rejects.toThrow(/needs a timezone field/);
  });

  it('accepts a complete pack with no timezone when usesRealTime is false', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': manifest({
          companion: {
            name: 'Testy',
            description: 'a test companion',
            voiceId: 'v',
            usesRealTime: false,
          },
        }),
        'system-prompt.md': 'x',
      }),
    );
    expect(pack.manifest.companion.usesRealTime).toBe(false);
  });

  it('names the wrapper folder when the folder was zipped instead of its contents', async () => {
    // The __MACOSX/ entry is what a Finder zip of a folder actually carries.
    // Unless it is filtered as junk, wrapperFolder sees two
    // top-level names and returns null, and this specific advice degrades to
    // the generic "No manifest.json at the pack root" message.
    const t = tree({
      'yourpack/manifest.json': complete(),
      'yourpack/media/a.jpg': '',
      '__MACOSX/._manifest.json': '',
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

  it('ignores macOS junk inside media/ rather than listing it as media', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': manifest({ base: 'autogoon.aimee' }),
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
      'Unsupported file in media/: a.gif — media must be jpg, jpeg, png, webp, mp4 or webm, each with a matching .md sidecar.',
      'A complete pack needs a system-prompt.md file.',
      'A complete pack needs a voiceId field in the companion section of manifest.json.',
      'A complete pack needs a description field in the companion section of manifest.json.',
      'A complete pack needs a timezone field in the companion section of manifest.json, or usesRealTime: false if the persona sets its own time of day.',
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
      'Unsupported file in media/: a.gif — media must be jpg, jpeg, png, webp, mp4 or webm, each with a matching .md sidecar.',
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
  it("skips a version field that isn't a string", () => {
    expect(
      peekManifest(JSON.stringify({ version: 2, base: 'autogoon.aimee' })),
    ).toEqual({ base: 'autogoon.aimee' });
  });

  it("returns nothing for input that isn't JSON", () => {
    expect(peekManifest('nope')).toEqual({});
  });

  it('reads a top-level name from a pre-companion-section manifest', () => {
    // Manifests written before the companion section existed carry the name at
    // the top level; peekManifest stays lenient about that so the admin row can
    // name a pack parsePack rejects.
    expect(peekManifest(JSON.stringify({ name: 'Testy' }))).toEqual({
      name: 'Testy',
    });
  });
});
