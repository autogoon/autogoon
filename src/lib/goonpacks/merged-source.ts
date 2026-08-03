// Two places a pack can be read from, as one source. buildLibrary takes a
// single LibrarySource and runs one cross-pack pass over everything it lists —
// which is what lets an overlay on disk sit on a base that was imported, and
// the reason this merges the sources rather than building two libraries and
// putting them together afterwards. Merged after the fact, that overlay would
// have looked for its base among the disk packs alone and been thrown out with
// "which isn't installed — import that pack first".
//
// Disk wins a key both offer. A source directory is the pack being worked on
// and the OPFS copy is an extraction of some earlier zip of it, so listing both
// would offer the same companion twice with no way to tell which was which.
//
// The clash is reported rather than acted on. Removing an installed pack is
// irreversible — its zip may be long gone, which is what GOONPACKS.md tells
// authors to keep — and listKeys runs before anything is validated, so at this
// point nothing knows whether the disk pack shadowing it is playable at all. A
// caller that has since built the index knows, and can take the ones that
// stood up.

import type { LibrarySource } from './library';
import type { ParsedMedia } from './pack';

export type Merged = {
  source: LibrarySource;
  // The keys disk shadowed, filled by the last listKeys and empty before it.
  // Which keys came off disk at all is the disk source's to say — it holds the
  // directory each was read from (disk-source.ts).
  clashed: () => string[];
};

export function mergedSource(
  disk: LibrarySource,
  installed: LibrarySource,
): Merged {
  // Which source listed each key, so the two reads that follow go back to
  // whichever one can answer for it.
  const from = new Map<string, LibrarySource>();
  let clashes: string[] = [];

  const source: LibrarySource = {
    listKeys: async () => {
      const [onDisk, inStore] = await Promise.all([
        disk.listKeys(),
        installed.listKeys(),
      ]);
      from.clear();
      for (const key of inStore) from.set(key, installed);
      clashes = onDisk.filter((key) => from.has(key));
      for (const key of onDisk) from.set(key, disk);
      return [...from.keys()];
    },

    openTree: (key) => from.get(key)?.openTree(key) ?? Promise.resolve(null),

    mediaUrl: (key: string, media: ParsedMedia) => {
      const source = from.get(key);
      if (source === undefined) {
        return Promise.reject(new Error(`missing media: ${key}/${media.file}`));
      }
      return source.mediaUrl(key, media);
    },
  };

  return { source, clashed: () => [...clashes] };
}
