// What this file decides: which installed version of a base an overlay row
// borrows its colour from. Everything else in the panel is rendering.
import { describe, it, expect } from '@jest/globals';
import { rowAccent } from './goonpacks-panel';
import type { PackRow } from '@/hooks/use-goonpack-library';
import type { PackManifest } from '@/lib/goonpacks/manifest';

const row = (
  id: string,
  version: string,
  companion: PackManifest['companion'],
  base?: string,
): PackRow => ({
  id: `${id}@${version}`,
  manifest: {
    format: 1,
    id,
    version,
    aboutThePack: 'a test pack',
    ...(base === undefined ? {} : { base }),
    companion,
  },
});

describe('rowAccent', () => {
  it("takes an overlay's colour from the newest installed version of its base", () => {
    // Oldest first, as the Goonpacks screen orders its rows.
    const packs = [
      row('test.base', '1.9.0', { accentColour: 'pink' }),
      row('test.base', '1.10.0', { accentColour: 'cyan' }),
      row('test.overlay', '1.0.0', {}, 'test.base'),
    ];

    expect(rowAccent(packs[2]!, packs)).toBe('cyan');
  });
});
