import { describe, expect, it } from '@jest/globals';
import { PackError, parseManifest } from './manifest';

const good = {
  format: 1,
  id: 'g00ner.aimee',
  version: '1.0.0',
  aboutThePack: 'a test pack',
};

describe('PackError', () => {
  it('carries the name the extraction worker sends across to mark a failure already phrased for the user', () => {
    expect(new PackError('The pack vanished from browser storage.').name).toBe(
      'PackError',
    );
  });
});

describe('parseManifest', () => {
  it('accepts a minimal overlay manifest', () => {
    expect(parseManifest({ ...good, base: 'autogoon.aimee' }).base).toBe(
      'autogoon.aimee',
    );
  });
  it('rejects a format newer than the app understands, asking for a newer version of the app', () => {
    expect(() => parseManifest({ format: 2, id: 'a.b', version: '1' })).toThrow(
      /newer version of the app/,
    );
  });
  it("rejects a format below the one it understands as one it doesn't recognise", () => {
    expect(() => parseManifest({ ...good, format: 0 })).toThrow(
      "This pack uses a format version this app doesn't recognise.",
    );
  });
  it('rejects a manifest with no format field', () => {
    expect(() => parseManifest({ ...good, format: undefined })).toThrow(
      PackError,
    );
  });
  it('rejects a format written as a string in quotes', () => {
    expect(() => parseManifest({ ...good, format: '1' })).toThrow(
      'manifest.json is missing the format field — add "format": 1.',
    );
  });
  it("rejects an id that isn't lowercase publisher.packname", () => {
    for (const id of ['aimee', 'A.b', 'a..b', 'a.b.c', 'a_b.c']) {
      expect(() => parseManifest({ ...good, id })).toThrow(
        'The id field must be publisher.packname — lowercase letters, numbers and hyphens only.',
      );
    }
  });
  it('reports a missing or empty id as a missing id field', () => {
    for (const id of [undefined, '']) {
      expect(() => parseManifest({ ...good, id })).toThrow(
        'manifest.json is missing the id field — every pack needs an id like publisher.packname.',
      );
    }
  });
  it('requires version as a non-empty string', () => {
    expect(() => parseManifest({ ...good, version: '' })).toThrow(PackError);
    expect(() => parseManifest({ ...good, version: 1 })).toThrow(PackError);
  });
  it("rejects a base that isn't a pack id", () => {
    expect(() => parseManifest({ ...good, base: 'nope' })).toThrow(PackError);
  });
  it('rejects a pack overlaying itself', () => {
    expect(() => parseManifest({ ...good, base: good.id })).toThrow(PackError);
  });
  it('rejects a name on an overlay', () => {
    expect(() =>
      parseManifest({
        ...good,
        base: 'autogoon.aimee',
        companion: { name: 'Amy' },
      }),
    ).toThrow(/can't change a companion's name/);
  });
  it('rejects a gender on an overlay', () => {
    expect(() =>
      parseManifest({
        ...good,
        base: 'autogoon.aimee',
        companion: { gender: 'female' },
      }),
    ).toThrow(/can't change a companion's gender/);
  });
  it('accepts noMedia on an overlay', () => {
    expect(
      parseManifest({ ...good, base: 'autogoon.aimee', noMedia: true }).noMedia,
    ).toBe(true);
  });
  it('rejects noMedia on a complete pack', () => {
    expect(() => parseManifest({ ...good, noMedia: true })).toThrow(
      /for overlay packs/,
    );
  });
  it("rejects a noMedia that isn't a boolean", () => {
    expect(() =>
      parseManifest({ ...good, base: 'autogoon.aimee', noMedia: 'yes' }),
    ).toThrow(PackError);
  });
  it('requires aboutThePack', () => {
    expect(() => parseManifest({ ...good, aboutThePack: undefined })).toThrow(
      /aboutThePack/,
    );
    expect(() => parseManifest({ ...good, aboutThePack: '' })).toThrow(
      /aboutThePack/,
    );
  });
  it('rejects an unknown accentColour', () => {
    expect(() =>
      parseManifest({ ...good, companion: { accentColour: 'mauve' } }),
    ).toThrow(PackError);
  });
  it('keeps a safelisted accentColour', () => {
    expect(
      parseManifest({ ...good, companion: { accentColour: 'teal' } }).companion
        .accentColour,
    ).toBe('teal');
  });
  it('rejects a gender outside female, male and nonbinary', () => {
    expect(() =>
      parseManifest({ ...good, companion: { gender: 'robot' } }),
    ).toThrow(PackError);
  });
  it('rejects unknown fields at either level — typos never pass silently', () => {
    expect(() => parseManifest({ ...good, name: 'Amy' })).toThrow(
      'Unknown field at the top level of manifest.json: name.',
    );
    expect(() => parseManifest({ ...good, accentColor: 'teal' })).toThrow(
      'Unknown field at the top level of manifest.json: accentColor.',
    );
    expect(() =>
      parseManifest({ ...good, companion: { voiceID: 'v' } }),
    ).toThrow('Unknown field in the companion section: voiceID.');
  });
  it("rejects a companion value that isn't a section", () => {
    expect(() => parseManifest({ ...good, companion: 'Amy' })).toThrow(
      /companion field must be a section/,
    );
  });
  it("rejects input that isn't a JSON object", () => {
    expect(() => parseManifest('nope')).toThrow(PackError);
  });
  it('collects every problem, not just the first', () => {
    let thrown: unknown;
    try {
      parseManifest({ format: 1, id: 'g00ner.aimee', base: 'autogoon.aimee' });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PackError);
    expect((thrown as PackError).problems).toEqual([
      'manifest.json is missing the version field - this is the version number of your pack',
      'manifest.json is missing the aboutThePack field — say what the pack adds or changes.',
    ]);
  });
});
