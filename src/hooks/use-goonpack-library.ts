// The pack library for React. One index per session, module-level: two screens
// each hold this hook (the Companions chooser and the Goonpacks tab), and a
// media file's object URL must be minted once and live as long as its index
// entry — two independent indexes would mint two and revoke neither. Import and
// removal replace the index and revoke what the old one handed out.
import { useCallback, useEffect, useState } from 'react';
import type { Companion } from '@/lib/companions/companions';
import type { LibraryEntry, PackOption } from '@/lib/goonpacks/entries';
import { diskSource, type DiskChoice } from '@/lib/goonpacks/disk-source';
import { prepareImport, type PendingImport } from '@/lib/goonpacks/import';
import {
  buildLibrary,
  carryMediaOver,
  type Library,
  type LibrarySource,
  type PackRow,
} from '@/lib/goonpacks/library';
import { mergedSource } from '@/lib/goonpacks/merged-source';
import { buildEntries, packKey } from '@/lib/goonpacks/entries';
import {
  applyOverlay,
  packToCompanion,
  packToCompanionRaw,
  resolveDefault,
} from '@/lib/goonpacks/resolve';
import { PackError } from '@/lib/goonpacks/manifest';
import {
  listCompletePackKeys,
  openPackTree,
  purgeLegacyDatabase,
  readMediaFile,
  removePackTree,
  sweepIncomplete,
} from '@/lib/goonpacks/store';

export type { LibraryEntry, PackOption, PackRow, PendingImport };

const installed: LibrarySource = {
  listKeys: listCompletePackKeys,
  openTree: openPackTree,
  mediaUrl: async (key, media) => {
    const file = await readMediaFile(key, media.file);
    if (file === null) throw new Error(`missing media: ${key}/${media.file}`);
    // slice re-types the file without reading it, so <video> and <img> get a
    // MIME type without the bytes ever entering the heap.
    return URL.createObjectURL(file.slice(0, file.size, media.mimeType));
  },
};

// Pack sources on the developer's own disk, played without being zipped and
// imported first: edit the directory, reload, and that is the whole loop. The
// routes behind it answer under `npm run dev` and nowhere else, so a deployed
// build never asks — the index is the OPFS packs alone, exactly as before.
const IS_DEV = process.env.NODE_ENV === 'development';

// Which sources to offer, and whose descriptions to play each with. Nothing
// chooses an experiment yet, so every source is offered with its hand-written
// sidecars — a source described only by an experiment therefore carries no
// media until the picker names one.
async function diskChoices(): Promise<DiskChoice[]> {
  if (!IS_DEV) return [];
  try {
    const response = await fetch('/api/inference/packs');
    if (!response.ok) return [];
    const { dirs } = (await response.json()) as { dirs?: string[] };
    return (dirs ?? []).map((dir) => ({ dir }));
  } catch {
    // A dev server that isn't answering is not a reason to have no library:
    // the installed packs are read either way.
    return [];
  }
}

const EMPTY: Library = {
  entries: buildEntries([]),
  rows: [],
  content: new Map(),
  manifests: new Map(),
  onDisk: new Set(),
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
  const { source, onDisk } = mergedSource(
    diskSource(await diskChoices()),
    installed,
  );
  // Where each pack was read from is the merge's to say, so it is stamped on
  // here rather than inside buildLibrary, which only ever sees one source.
  const built = { ...(await buildLibrary(source)), onDisk: new Set(onDisk()) };
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

// `onScreen` is what builds the index. Every panel in the app is mounted for
// the whole session and hidden with a class, so a hook that built on mount
// built at startup — reading every installed pack's sidecars before anything
// had asked for a companion. Whichever of the two screens is opened first pays
// for it; the other finds the same build already in flight.
export function useGoonpackLibrary(onScreen: boolean) {
  const [state, setState] = useState<Library>(() => current ?? EMPTY);
  // "error" is a library that couldn't be read at all — storage refused, rather
  // than a pack being wrong. The panels say so instead of waiting forever.
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    current === null ? 'loading' : 'ready',
  );

  // Watching is separate from building, and lasts the panel's whole life: an
  // import on the Goonpacks tab rebuilds the index, and the chooser has to hear
  // about it whether or not it is the screen being looked at.
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    if (!onScreen) return;
    void library().then(
      () => setStatus('ready'),
      () => setStatus('error'),
    );
  }, [onScreen]);

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
    onDisk: state.onDisk,
    importPack,
    removePack,
    resolveVariant,
  };
}
