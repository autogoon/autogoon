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
  carryMediaOver,
  type Library,
  type LibrarySource,
  type PackRow,
} from '@/lib/goonpacks/library';
import { buildEntries, packKey } from '@/lib/goonpacks/entries';
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
let purged = false;
const listeners = new Set<(library: Library) => void>();

// `replaced` is the key an import just overwrote, whose old media entries point
// at a tree that no longer exists.
async function load(replaced: ReadonlySet<string>): Promise<Library> {
  // One clean pass before anything reads the trees: a tree with no marker is an
  // interrupted import or removal.
  await sweepIncomplete();
  // The old zip database goes on the session's first load — nothing reads it,
  // and it is holding quota. Deleting it again on every rebuild would be work
  // for nothing.
  if (!purged) {
    purged = true;
    void purgeLegacyDatabase();
  }
  const built = await buildLibrary(source);
  if (current !== null) carryMediaOver(current, built, replaced);
  current = built;
  for (const listener of listeners) listener(built);
  return built;
}

// Remember the load in flight so every caller shares it — and forget it if it
// fails, so the next caller retries instead of inheriting the rejection for the
// rest of the session.
function remember(build: Promise<Library>): Promise<Library> {
  inflight = build;
  void build.catch(() => {
    if (inflight === build) inflight = null;
  });
  return build;
}

function library(): Promise<Library> {
  return inflight ?? remember(load(new Set()));
}

// After an import or a removal: build a fresh index, and let it adopt the media
// entries of every pack that is still installed and untouched. Chained onto
// whatever is already in flight, because two overlapping loads race — whichever
// FINISHED last would become the index, regardless of which started, so a
// removal could drop the pack an import had just added.
function rebuild(replaced?: string): Promise<Library> {
  const keys = new Set(replaced === undefined ? [] : [replaced]);
  const previous = inflight ?? Promise.resolve(null);
  return remember(previous.catch(() => null).then(() => load(keys)));
}

export function useGoonpackLibrary() {
  const [state, setState] = useState<Library>(() => current ?? EMPTY);
  // "error" is a library that couldn't be read at all — storage refused, rather
  // than a pack being wrong. The panels say so instead of waiting forever.
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    current === null ? 'loading' : 'ready',
  );

  useEffect(() => {
    listeners.add(setState);
    void library().then(
      () => setStatus('ready'),
      () => setStatus('error'),
    );
    return () => {
      listeners.delete(setState);
    };
  }, []);

  // Mirror a rebuild's outcome into `status`, and still let the caller see a
  // failure: an import reports its own on the confirm sheet.
  const track = useCallback(async (build: Promise<Library>) => {
    setStatus('loading');
    try {
      await build;
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      throw e;
    }
  }, []);

  const importPack = useCallback(
    async (file: File): Promise<PendingImport> => {
      const lib = await library();
      const pending = await prepareImport(file, lib.manifests);
      return {
        ...pending,
        commit: async (onProgress) => {
          await pending.commit(onProgress);
          // This pack's tree was just rewritten, so its old media entries point
          // at files that are gone; every other pack's carry over untouched.
          await track(rebuild(packKey(pending.manifest)));
        },
      };
    },
    [track],
  );

  // Removal never cascades: overlays of a removed base stay installed and simply
  // list as incompatible ("base companion isn't installed") until the base
  // returns. Threads are untouched either way.
  const removePack = useCallback(
    async (key: string) => {
      await removePackTree(key);
      await track(rebuild()).catch(() => {
        // the error state is already on screen
      });
    },
    [track],
  );

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
  };
}
