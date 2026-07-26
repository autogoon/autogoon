// The import pipeline: check the quota, extract the zip into its tree, validate
// the tree, and only then write the marker that makes it an installed pack.
// A tree that fails deletes itself; an abandoned one is removed by the clean
// pass at the next load, so there is no cancel to implement.
import { COMPANIONS } from '@/lib/companions/companions';
import { extractZip, peekZip } from './extract';
import { packKey } from './entries';
import { baseError } from './library';
import { PackError, parseManifest, type PackManifest } from './manifest';
import { parsePack } from './pack';
import {
  createPackDir,
  estimateHeadroom,
  importLock,
  markComplete,
  openPackTree,
  removePackTree,
  requestPersistence,
} from './store';

export type ImportStage = {
  phase: 'extracting' | 'checking';
  bytes: number;
  total: number;
};

export type PendingImport = {
  manifest: PackManifest;
  replaces: boolean; // this exact id+version is already installed
  commit(onProgress?: (stage: ImportStage) => void): Promise<void>;
};

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

// Read the zip's manifest and run the checks that don't need the tree, so the
// confirm sheet names the pack before anything is written.
export async function prepareImport(
  file: File,
  installed: Map<string, PackManifest>,
): Promise<PendingImport> {
  const { manifest: raw, names } = await peekZip(file);
  if (raw === null) {
    const tops = new Set(
      names.map((n) => (n.includes('/') ? n.slice(0, n.indexOf('/')) : '')),
    );
    const wrapper = tops.size === 1 ? [...tops][0]! : '';
    throw new PackError(
      wrapper !== ''
        ? `Everything is inside ${wrapper}/ — zip the folder's contents, not the folder.`
        : "No manifest.json at the zip root — zip the pack folder's contents, not the folder.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PackError(
      "manifest.json isn't valid JSON — check for missing quotes or commas.",
    );
  }
  const m = parseManifest(parsed);

  // Immediate feedback on what the load pass would reject anyway.
  if (m.base === undefined && COMPANIONS[m.id] !== undefined) {
    throw new PackError(
      "The pack's id belongs to a built-in companion — pick a different id.",
    );
  }
  const err = baseError(m, (id) => {
    if (COMPANIONS[id] !== undefined) return 'companion';
    for (const v of installed.values()) {
      if (v.id === id) return v.base === undefined ? 'companion' : 'overlay';
    }
    return undefined;
  });
  if (err !== null) throw new PackError(err);

  const key = packKey(m);
  return {
    manifest: m,
    replaces: installed.has(key),
    commit: async (onProgress) => {
      const headroom = await estimateHeadroom(file.size);
      if (!headroom.ok) {
        throw new PackError(
          `Not enough browser storage: this pack needs about ${mb(file.size)} and there is ${mb(headroom.available)} free.`,
        );
      }
      await requestPersistence();
      // Everything that writes the tree happens inside the import lock: until
      // the marker lands, the tree on disk is indistinguishable from one an
      // interrupted import left behind, and any clean pass — this tab's or
      // another tab's — would delete it mid-extraction. Held on the main
      // thread so it still spans extraction once that moves into a worker.
      await navigator.locks.request(importLock(key), async () => {
        onProgress?.({ phase: 'extracting', bytes: 0, total: file.size });
        const dir = await createPackDir(key);
        try {
          await extractZip(file, dir, (bytes) =>
            onProgress?.({ phase: 'extracting', bytes, total: file.size }),
          );
        } catch (e) {
          await removePackTree(key);
          throw e instanceof PackError
            ? e
            : new PackError("The zip couldn't be read.");
        }
        onProgress?.({ phase: 'checking', bytes: file.size, total: file.size });
        const tree = await openPackTree(key);
        if (tree === null) {
          throw new PackError('The pack vanished from browser storage.');
        }
        try {
          const validated = await parsePack(tree);
          if (packKey(validated.manifest) !== key) {
            throw new PackError(
              "The pack's id and version don't match the manifest it was read from.",
            );
          }
        } catch (e) {
          await removePackTree(key);
          throw e;
        }
        // Last: the tree is complete and valid, and only now is it installed.
        await markComplete(key);
      });
    },
  };
}
