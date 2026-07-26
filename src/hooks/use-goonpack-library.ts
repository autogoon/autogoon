'use client';
// The pack library for React. One index per session, module-level: two screens
// each hold this hook (the Companions chooser and the Goonpacks tab), and a
// media file's object URL must be minted once and live as long as its index
// entry — two independent indexes would mint two and revoke neither. Import and
// removal replace the index and revoke what the old one handed out.
import { useCallback, useEffect, useState } from 'react';
import type { Companion } from '@/lib/companions/companions';
import type { LibraryEntry, PackOption } from '@/lib/goonpacks/entries';
import { prepareImport, type PendingImport } from '@/lib/goonpacks/import';
import {
  buildLibrary,
  revokeLibrary,
  type Library,
  type LibrarySource,
  type PackRow,
} from '@/lib/goonpacks/library';
import { buildEntries } from '@/lib/goonpacks/entries';
import {
  applyOverlay,
  packToCompanion,
  packToCompanionRaw,
  resolveDefault,
} from '@/lib/goonpacks/resolve';
import { PackError } from '@/lib/goonpacks/manifest';
import {
  listPackKeys,
  openPackTree,
  purgeLegacyDatabase,
  readMediaFile,
  removePackTree,
  sweepIncomplete,
} from '@/lib/goonpacks/store';

export type { LibraryEntry, PackOption, PackRow, PendingImport };

const source: LibrarySource = {
  listKeys: listPackKeys,
  openTree: openPackTree,
  mediaUrl: async (key, media) => {
    const file = await readMediaFile(key, media.file);
    if (file === null) throw new Error(`missing media: ${key}/${media.file}`);
    // slice re-types the file without reading it, so <video> and <img> get a
    // MIME type without the bytes ever entering the heap.
    return URL.createObjectURL(file.slice(0, file.size, media.mimeType));
  },
};

const EMPTY: Library = {
  entries: buildEntries([]),
  rows: [],
  content: new Map(),
  manifests: new Map(),
};

// The session's one index, and the components watching it.
let current: Library | null = null;
let inflight: Promise<Library> | null = null;
const listeners = new Set<(library: Library) => void>();

async function load(): Promise<Library> {
  // One clean pass before anything reads the trees: a tree with no marker is an
  // interrupted import or removal. Then the old zip database goes, once —
  // nothing reads it, and it is holding quota.
  await sweepIncomplete();
  void purgeLegacyDatabase();
  const built = await buildLibrary(source);
  if (current !== null) revokeLibrary(current);
  current = built;
  for (const listener of listeners) listener(built);
  return built;
}

function library(): Promise<Library> {
  return (inflight ??= load());
}

// After an import or a removal: throw the index away and build a fresh one,
// revoking the URLs the old one handed out.
function rebuild(): Promise<Library> {
  inflight = load();
  return inflight;
}

export function useGoonpackLibrary() {
  const [state, setState] = useState<Library>(() => current ?? EMPTY);
  const [status, setStatus] = useState<'loading' | 'ready'>(() =>
    current === null ? 'loading' : 'ready',
  );

  useEffect(() => {
    listeners.add(setState);
    void library().then(() => setStatus('ready'));
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const refresh = useCallback(async () => {
    setStatus('loading');
    await rebuild();
    setStatus('ready');
  }, []);

  const importPack = useCallback(async (file: File): Promise<PendingImport> => {
    const lib = await library();
    const pending = await prepareImport(file, lib.manifests);
    return {
      ...pending,
      commit: async (onProgress) => {
        await pending.commit(onProgress);
        await rebuild();
      },
    };
  }, []);

  // Removal never cascades: overlays of a removed base stay installed and simply
  // list as incompatible ("base companion isn't installed") until the base
  // returns. Threads are untouched either way.
  const removePack = useCallback(async (key: string) => {
    await removePackTree(key);
    await rebuild();
  }, []);

  // Resolve a pick to a playable Companion. Everything it needs is already in
  // the index — no I/O, no object URLs minted here (those happen on first
  // render), so a variant switch is synchronous in all but name.
  const resolveVariant = useCallback(
    async (
      entry: LibraryEntry,
      baseKey: string | null,
      overlayKey: string | null,
    ): Promise<Companion | null> => {
      const lib = await library();
      const content = (key: string) => {
        const c = lib.content.get(key);
        if (c === undefined) {
          throw new PackError(
            'The pack is gone from browser storage — re-import its zip.',
          );
        }
        return c;
      };
      if (overlayKey === null) {
        return baseKey === null
          ? resolveDefault(entry.companion)
          : packToCompanion(content(baseKey));
      }
      const base =
        baseKey === null
          ? entry.companion
          : packToCompanionRaw(content(baseKey));
      return applyOverlay(base, content(overlayKey));
    },
    [],
  );

  return {
    status,
    entries: state.entries,
    packs: state.rows,
    importPack,
    removePack,
    resolveVariant,
    refresh,
  };
}
