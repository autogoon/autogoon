import { describe, expect, it } from '@jest/globals';
import { strToU8, zipSync } from 'fflate';
import { PackError } from './manifest';
import { parsePack, peekPack } from './pack';

const manifest = (extra: object = {}) =>
  strToU8(
    JSON.stringify({
      format: 2,
      id: 'test.pack',
      version: '1.0.0',
      aboutThePack: 'a test pack',
      ...extra,
    }),
  );
const complete = (extra: object = {}) =>
  manifest({ companion: { name: 'Testy', voiceId: 'v123' }, ...extra });

describe('parsePack', () => {
  it('parses a complete pack with pictures and sidecars', () => {
    const zip = zipSync({
      'manifest.json': complete(),
      'system-prompt.md': strToU8('You are Testy.'),
      'pictures/a.jpg': new Uint8Array([1, 2, 3]),
      'pictures/a.txt': strToU8('desc a'),
      'pictures/b.png': new Uint8Array([4]),
    });
    const pack = parsePack(zip);
    expect(pack.manifest.id).toBe('test.pack');
    expect(pack.systemPrompt).toBe('You are Testy.');
    expect(pack.pictures).toHaveLength(2);
    expect(pack.pictures[0]).toMatchObject({
      name: 'a',
      description: 'desc a',
      mimeType: 'image/jpeg',
    });
    expect(pack.pictures[1]).toMatchObject({ name: 'b', description: '' });
  });
  it('accepts an overlay with nothing but a manifest', () => {
    const zip = zipSync({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
    });
    expect(parsePack(zip).pictures).toEqual([]);
  });
  it('requires aboutThePack at import', () => {
    const zip = zipSync({
      'manifest.json': manifest({
        base: 'autogoon.aimee',
        aboutThePack: undefined,
      }),
    });
    expect(() => parsePack(zip)).toThrow(/aboutThePack/);
  });
  it('rejects noMedia alongside a pictures/ folder', () => {
    const zip = zipSync({
      'manifest.json': manifest({ base: 'autogoon.aimee', noMedia: true }),
      'pictures/a.jpg': new Uint8Array([1]),
    });
    expect(() => parsePack(zip)).toThrow(/noMedia/);
    const clean = zipSync({
      'manifest.json': manifest({ base: 'autogoon.aimee', noMedia: true }),
    });
    expect(parsePack(clean).manifest.noMedia).toBe(true);
  });
  it('rejects a complete pack missing prompt/name/voiceId', () => {
    expect(() => parsePack(zipSync({ 'manifest.json': complete() }))).toThrow(
      /system-prompt/,
    );
    expect(() =>
      parsePack(
        zipSync({
          'manifest.json': manifest({ companion: { voiceId: 'v' } }),
          'system-prompt.md': strToU8('x'),
        }),
      ),
    ).toThrow(PackError);
  });
  it('rejects a zip without a root manifest, hinting at folder-zips', () => {
    const zip = zipSync({ 'pack/manifest.json': complete() });
    expect(() => parsePack(zip)).toThrow(/root/);
  });
  it('rejects duplicate picture stems across extensions', () => {
    const zip = zipSync({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'pictures/a.jpg': new Uint8Array([1]),
      'pictures/a.png': new Uint8Array([2]),
    });
    expect(() => parsePack(zip)).toThrow(PackError);
    expect(() => parsePack(zip)).toThrow(/share the name/);
  });
  it('rejects unsupported files under pictures/', () => {
    const zip = zipSync({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'pictures/a.gif': new Uint8Array([1]),
    });
    expect(() => parsePack(zip)).toThrow(PackError);
  });
  it('ignores macOS zip junk', () => {
    const zip = zipSync({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      '__MACOSX/._manifest.json': new Uint8Array([0]),
      '.DS_Store': new Uint8Array([0]),
      'pictures/.DS_Store': new Uint8Array([0]),
    });
    expect(parsePack(zip).pictures).toEqual([]);
  });
  it('rejects an unreadable zip', () => {
    expect(() => parsePack(new Uint8Array([9, 9, 9]))).toThrow(PackError);
  });
  it('collects every problem it can determine in one throw', () => {
    const problems = (zip: Uint8Array): string[] => {
      try {
        parsePack(zip);
        return [];
      } catch (e) {
        return (e as PackError).problems;
      }
    };
    // A valid manifest: completeness and zip problems all report together.
    expect(
      problems(
        zipSync({
          'manifest.json': manifest({ companion: { name: 'Testy' } }),
          'pictures/a.gif': new Uint8Array([1]),
        }),
      ),
    ).toEqual([
      'Unsupported file in pictures/: a.gif — pictures must be jpg, jpeg, png or webp, with descriptions in matching .txt files.',
      'A complete pack needs a system-prompt.md file.',
      'A complete pack needs a voiceId field in the companion section of manifest.json.',
    ]);
    // A broken manifest: its problems merge with the zip's (completeness
    // checks need a readable manifest, so those wait).
    expect(
      problems(
        zipSync({
          'manifest.json': manifest({
            version: undefined,
            companion: { name: 'Testy' },
          }),
          'pictures/a.gif': new Uint8Array([1]),
        }),
      ),
    ).toEqual([
      'manifest.json is missing the version field - this is the version number of your pack',
      'Unsupported file in pictures/: a.gif — pictures must be jpg, jpeg, png or webp, with descriptions in matching .txt files.',
    ]);
  });
});

describe('peekPack', () => {
  it("reads the manifest's string fields from a zip parsePack rejects", () => {
    const zip = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          id: 'test.pack',
          version: '0.9.0',
          companion: { name: 'Testy' },
          base: 'autogoon.aimee',
          format: 'bad',
        }),
      ),
    });
    expect(() => parsePack(zip)).toThrow(PackError);
    expect(peekPack(zip)).toEqual({
      name: 'Testy',
      version: '0.9.0',
      base: 'autogoon.aimee',
    });
  });
  it('ignores non-string fields and unreadable input', () => {
    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify({ version: 2, name: 'Testy' })),
    });
    // A top-level name (the pre-companion-section shape) still peeks.
    expect(peekPack(zip)).toEqual({ name: 'Testy' });
    expect(peekPack(new Uint8Array([9, 9, 9]))).toEqual({});
    expect(peekPack(zipSync({ 'manifest.json': strToU8('nope') }))).toEqual({});
  });
});
