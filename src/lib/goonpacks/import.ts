// The import pipeline: check the quota, extract the zip into its tree, validate
// the tree, and only then write the marker that makes it an installed pack.
// A tree that fails deletes itself; an abandoned one is removed by the clean
// pass at the next load, so there is no cancel to implement.
import { COMPANIONS } from '@/lib/companions/companions';
import { peekZip } from './extract';
import type { ExtractMessage, ExtractRequest } from './extract-worker';
import { packKey } from './entries';
import { baseError } from './library';
import { PackError, parseManifest, type PackManifest } from './manifest';
import { parsePack, wrapperFolder } from './pack';
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

// What went wrong inside the worker, in the user's terms. Not every failure in
// there is about the zip, and sending someone off to re-zip a pack that is fine
// would be the wrong errand: running out of room mid-extract is its own story
// (the up-front headroom check makes it rare rather than impossible — another
// tab can take the space in between), and so is anything the worker already
// phrased as a PackError. Only what's left is the zip's fault.
export function extractionError(name: string, message: string): PackError {
  if (name === 'QuotaExceededError') {
    return new PackError(
      'Browser storage filled up part-way through unpacking this pack — free some space and try again.',
    );
  }
  // What the worker raises as a PackError: storage it couldn't open, a tree that
  // went missing.
  if (name === 'PackError') return new PackError(message);
  return new PackError(`The zip couldn't be read: ${message}.`);
}

// Run extraction in a dedicated worker, resolving when the tree is written.
// The worker is created per import and terminated either way — extraction is
// the only thing it does.
function extractInWorker(
  file: File,
  key: string,
  onProgress: (bytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./extract-worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ExtractMessage>) => {
      const m = event.data;
      if (m.type === 'progress') onProgress(m.bytes);
      else {
        worker.terminate();
        if (m.type === 'done') resolve();
        else reject(extractionError(m.name, m.message));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      reject(new PackError(`Extraction couldn't start: ${event.message}.`));
    };
    worker.postMessage({ file, key } satisfies ExtractRequest);
  });
}

// Read the zip's manifest and run the checks that don't need the tree, so the
// confirm sheet names the pack before anything is written.
export async function prepareImport(
  file: File,
  installed: Map<string, PackManifest>,
): Promise<PendingImport> {
  const { manifest: raw, names } = await peekZip(file);
  if (raw === null) {
    // The same reading parsePack gives an extracted tree, so a zip and the tree
    // it would become name the fault identically.
    const wrapper = wrapperFolder(names);
    throw new PackError(
      wrapper !== null
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
      // thread, spanning the worker call that does the extraction itself.
      await navigator.locks.request(importLock(key), async () => {
        onProgress?.({ phase: 'extracting', bytes: 0, total: file.size });
        await createPackDir(key);
        try {
          await extractInWorker(file, key, (bytes) =>
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
