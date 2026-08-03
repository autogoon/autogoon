/**
 * @jest-environment jsdom
 */
// That the index is built when a screen asks for it, and not before. The
// ordering of two rebuilds is use-goonpack-library.test.ts's. The two live in
// separate files rather than as two tests in one because the index is module
// state that outlives a component, and Jest gives a fresh module registry per
// file rather than per test.
import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PackTree } from '@/lib/goonpacks/pack';

// Every build starts by listing the installed packs, so counting the listing
// counts the builds.
let listed = 0;

jest.mock('../lib/goonpacks/store', () => ({
  listCompletePackKeys: () => {
    listed++;
    return Promise.resolve(['pub.a@1.0.0']);
  },
  openPackTree: (): Promise<PackTree | null> =>
    Promise.resolve({
      names: ['manifest.json'],
      readText: () =>
        Promise.resolve(
          JSON.stringify({
            format: 2,
            id: 'pub.a',
            version: '1.0.0',
            aboutThePack: 'a test pack',
            companion: { name: 'A', voiceId: 'v' },
          }),
        ),
    }),
  removePackTree: () => Promise.resolve(),
  sweepIncomplete: () => Promise.resolve([]),
  purgeLegacyDatabase: () => Promise.resolve(),
  readMediaFile: () => Promise.resolve(null),
}));

describe('useGoonpackLibrary', () => {
  it('reads no storage until a screen holding it is the one being looked at', async () => {
    const { useGoonpackLibrary } = await import('./use-goonpack-library');
    const { result, rerender } = renderHook(
      ({ onScreen }: { onScreen: boolean }) => useGoonpackLibrary(onScreen),
      { initialProps: { onScreen: false } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(listed).toBe(0);

    rerender({ onScreen: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(listed).toBe(1);
    expect(result.current.packs.map((p) => p.id)).toEqual(['pub.a@1.0.0']);
  });
});
