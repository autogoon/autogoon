/**
 * @jest-environment jsdom
 */
// What the hook adds over buildLibrary: the ordering of two rebuilds. Which
// packs a set of trees validates to is library.test.ts's, and what a tree
// contains is store.test.ts's — storage is faked at the module boundary here,
// and every tree in it is already valid.
//
// One test, and no jest.resetModules(): the index is module state that outlives
// a component, so a second test would inherit the first one's — and the reset
// that would fix it cannot be had, because re-importing @testing-library/react
// registers its cleanup hooks a second time and re-importing only the hook
// leaves it holding a different copy of React than the renderer.
import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PackTree } from '@/lib/goonpacks/pack';
import type { PendingImport } from '@/lib/goonpacks/import';

const manifest = (key: string) =>
  JSON.stringify({
    format: 2,
    id: key.slice(0, key.indexOf('@')),
    version: key.slice(key.indexOf('@') + 1),
    aboutThePack: 'a test pack',
    companion: { name: key, voiceId: 'v' },
  });

const IMPORTED = 'pub.new@1.0.0';
const disk = new Set(['pub.a@1.0.0', 'pub.b@1.0.0']);

// Reads waiting on the test. A read snapshots the disk when it starts and hands
// that snapshot back when released, which is what lets a rebuild finish holding
// a view of the disk that has since moved on.
const pendingReads: (() => void)[] = [];

jest.mock('../lib/goonpacks/store', () => ({
  listCompletePackKeys: () => {
    const snapshot = [...disk];
    return new Promise<string[]>((resolve) => {
      pendingReads.push(() => resolve(snapshot));
    });
  },
  openPackTree: (key: string) =>
    Promise.resolve<PackTree | null>(
      disk.has(key)
        ? {
            names: ['manifest.json'],
            readText: () => Promise.resolve(manifest(key)),
          }
        : null,
    ),
  removePackTree: (key: string) => {
    disk.delete(key);
    return Promise.resolve();
  },
  sweepIncomplete: () => Promise.resolve([]),
  purgeLegacyDatabase: () => Promise.resolve(),
  readMediaFile: () => Promise.resolve(null),
}));

// prepareImport streams a zip, runs a worker and takes a Web Lock, none of
// which decides what this file is about. The stand-in writes the tree its
// commit was asked for — the only thing the hook sees an import do.
jest.mock('../lib/goonpacks/import', () => ({
  prepareImport: (): Promise<PendingImport> =>
    Promise.resolve({
      manifest: JSON.parse(manifest(IMPORTED)) as PendingImport['manifest'],
      replaces: false,
      commit: () => {
        disk.add(IMPORTED);
        return Promise.resolve();
      },
    }),
}));

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

// Drive every rebuild to completion. Each round first lets everything that can
// start reach its read, releasing nothing — so rebuilds in flight at
// once are all waiting together. Then they go newest first, each driven to
// completion before the next is let go, which lands the OLDEST read's rebuild
// last, holding the oldest view of the disk. Releasing them as they appeared
// instead would serialise them by hand and report a concurrent rebuild as a
// sequenced one.
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) {
    for (let i = 0; i < 20; i++) await flush();
    if (pendingReads.length === 0) return;
    for (const release of pendingReads.splice(0).reverse()) {
      release();
      for (let i = 0; i < 20; i++) await flush();
    }
  }
}

// Run until something is waiting to read the disk.
async function untilReading(): Promise<void> {
  for (let i = 0; i < 50 && pendingReads.length === 0; i++) await flush();
}

describe('useGoonpackLibrary', () => {
  // Both operations write the trees first and rebuild the index second, so two
  // rebuilds are in flight at once, each listing the packs when it gets to it.
  // Run concurrently, the one that FINISHES last becomes the index whatever
  // order they started in — and here that is the removal's, whose listing was
  // taken before the import wrote its tree, so the imported pack is missing
  // from an index built after it landed.
  //
  // The mirror case needs no sequencing and is not what this pins: a listing
  // that still names a pack since removed corrects itself, because buildLibrary
  // reads every tree it listed and drops the one that comes back gone.
  it('keeps an import that commits while a removal is still rebuilding', async () => {
    const { useGoonpackLibrary } = await import('./use-goonpack-library');
    const { result } = renderHook(() => useGoonpackLibrary());
    await settle();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Prepared before the removal starts: importPack waits on whatever rebuild
    // is in flight, and the point here is the commit, not the preparation.
    const pending = await result.current.importPack(new File([], 'pack.zip'));

    const removed = result.current.removePack('pub.b@1.0.0');
    // Let the removal's rebuild reach its listing first, so the import's write
    // is the change that listing cannot see.
    await untilReading();
    const committed = pending.commit();

    await settle();
    await Promise.all([committed, removed]);

    expect(result.current.packs.map((p) => p.id).sort()).toEqual([
      'pub.a@1.0.0',
      IMPORTED,
    ]);
    expect([...disk].sort()).toEqual(['pub.a@1.0.0', IMPORTED]);
  });
});
