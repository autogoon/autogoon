// Pack storage: OPFS holds ONE directory tree per installed pack, keyed by
// id@version, containing the pack's files as extracted. Nothing derived is
// persisted anywhere — the library is rebuilt from the trees at every load — so
// there is exactly one notion of a valid pack and no second store to drift out
// of step. The user's zip files remain the store of record ("Packs live in
// browser storage; keep your zips").
//
// A marker file, written last, means the tree is complete: extraction and
// validation both succeeded before it appeared. Validation goes on names, so it
// cannot tell a complete media/ from one missing six hundred files — the marker
// is the only signal that says so. Removal deletes the marker first and the tree
// second, so a crash mid-removal leaves exactly what a crash mid-import leaves,
// and one clean pass at load covers both.
import { PackError } from './manifest';
import { isJunkPath } from './media';
import { MEDIA_DIR, type PackTree } from './pack';

export const PACKS_DIR = 'goonpacks';
export const MARKER = '.complete';

// A browser can present the whole storage API and still refuse to hand over a
// directory, so this is what every write path says when it can't get one —
// reading just comes back empty, which is a library with no packs in it.
const NO_STORAGE =
  "This browser can't store packs — private browsing and restricted storage settings are the usual cause.";

export async function packsRoot(
  create = false,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(PACKS_DIR, { create });
  } catch {
    return null; // no OPFS, or the directory doesn't exist yet
  }
}

// `kind` distinguishes the two handle types at runtime, but they're related by
// inheritance rather than a union, so TypeScript needs telling.
const isDirectory = (h: FileSystemHandle): h is FileSystemDirectoryHandle =>
  h.kind === 'directory';

export async function listPackKeys(): Promise<string[]> {
  const packs = await packsRoot();
  if (packs === null) return [];
  const keys: string[] = [];
  for await (const [name, handle] of packs.entries()) {
    if (isDirectory(handle)) keys.push(name);
  }
  return keys;
}

// Every file in a pack's tree, as validation sees it: root files plus one level
// of media/ (deeper nesting is listed too, so parsePack can reject it by name).
async function listTree(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  const walk = async (
    handle: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<void> => {
    for await (const [name, entry] of handle.entries()) {
      const path = `${prefix}${name}`;
      if (isDirectory(entry)) {
        await walk(entry, `${path}/`);
      } else if (!isJunkPath(path)) {
        names.push(path);
      }
    }
  };
  await walk(dir, '');
  return names;
}

export async function openPackTree(key: string): Promise<PackTree | null> {
  const packs = await packsRoot();
  if (packs === null) return null;
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await packs.getDirectoryHandle(key);
  } catch {
    return null;
  }
  const names = await listTree(dir);
  return {
    names,
    readText: async (path: string) => {
      const parts = path.split('/');
      let at = dir;
      for (const part of parts.slice(0, -1)) {
        at = await at.getDirectoryHandle(part);
      }
      const file = await at.getFileHandle(parts[parts.length - 1]!);
      return (await file.getFile()).text();
    },
  };
}

// A fresh directory for a pack being imported: any existing tree goes first, so
// a re-import never merges with what it replaces.
export async function createPackDir(
  key: string,
): Promise<FileSystemDirectoryHandle> {
  const packs = await packsRoot(true);
  if (packs === null) throw new PackError(NO_STORAGE);
  await packs.removeEntry(key, { recursive: true }).catch(() => {
    // nothing there — the common case
  });
  return packs.getDirectoryHandle(key, { create: true });
}

export async function markComplete(key: string): Promise<void> {
  const packs = await packsRoot(true);
  if (packs === null) throw new PackError(NO_STORAGE);
  const dir = await packs.getDirectoryHandle(key);
  const marker = await dir.getFileHandle(MARKER, { create: true });
  await (await marker.createWritable()).close();
}

export async function hasMarker(key: string): Promise<boolean> {
  const packs = await packsRoot();
  if (packs === null) return false;
  try {
    const dir = await packs.getDirectoryHandle(key);
    await dir.getFileHandle(MARKER);
    return true;
  } catch {
    return false;
  }
}

// Marker first, tree second: an interrupted removal leaves a markerless tree,
// which is what the clean pass already deletes.
export async function removePackTree(key: string): Promise<void> {
  const packs = await packsRoot();
  if (packs === null) return;
  try {
    const dir = await packs.getDirectoryHandle(key);
    await dir.removeEntry(MARKER).catch(() => {
      // already gone
    });
  } catch {
    return; // no tree
  }
  await packs.removeEntry(key, { recursive: true }).catch(() => {
    // already gone
  });
}

// The name of the lock an import holds for as long as it is writing a pack's
// tree. The marker says "finished"; this says "being written right now", which
// a markerless tree on disk can't distinguish from one abandoned by a crash.
// A Web Lock is the browser's to release — it goes the moment the holding tab
// closes, navigates away or crashes — so an import that dies needs no timeout
// and no staleness constant: the next sweep simply finds the lock free.
export const importLock = (key: string): string => `goonpack-import:${key}`;

// The one clean pass, run before every library build: a tree with no marker is
// a crashed import, a cancelled import or a crashed removal — all the same
// state, all deleted. A tree whose import lock is held is none of those: it is
// being written, here or in another tab, and is left alone.
export async function sweepIncomplete(): Promise<string[]> {
  const removed: string[] = [];
  for (const key of await listPackKeys()) {
    if (await hasMarker(key)) continue;
    const importing = await navigator.locks.request(
      importLock(key),
      { ifAvailable: true },
      (lock) => lock === null, // null = the lock is held elsewhere
    );
    if (importing) continue;
    await removePackTree(key);
    removed.push(key);
  }
  return removed;
}

// A media file as a File — disk-backed and seekable, which is what a <video>
// needs and what keeps a still off the heap until it is shown.
export async function readMediaFile(
  key: string,
  file: string,
): Promise<File | null> {
  const packs = await packsRoot();
  if (packs === null) return null;
  try {
    const dir = await packs.getDirectoryHandle(key);
    const media = await dir.getDirectoryHandle(MEDIA_DIR.replace('/', ''));
    return await (await media.getFileHandle(file)).getFile();
  } catch {
    return null;
  }
}

// Refuse an import up front with a real number rather than failing partway
// through. Headroom covers the extracted copy plus the browser's own slack.
const HEADROOM_BYTES = 64 * 1024 * 1024;

export async function estimateHeadroom(
  bytes: number,
): Promise<{ ok: boolean; available: number }> {
  let est: StorageEstimate;
  try {
    est = await navigator.storage.estimate();
  } catch {
    // A browser that won't even say how much room it has won't give us a
    // directory either — say so here, as the first thing an import does.
    throw new PackError(NO_STORAGE);
  }
  const quota = est.quota ?? 0;
  const usage = est.usage ?? 0;
  const available = Math.max(0, quota - usage);
  return { ok: available >= bytes + HEADROOM_BYTES, available };
}

// Asked once, on the first import: without it the origin's storage is
// best-effort and can be evicted under pressure. The answer is never waited
// for — Firefox settles persist() only when the user answers its permission
// prompt, which may be never, and an import that works either way must not
// hang behind it.
export async function requestPersistence(): Promise<void> {
  try {
    if (await navigator.storage.persisted()) return;
    void navigator.storage.persist().catch(() => {
      // denied, or not supported — best-effort storage it is
    });
  } catch {
    // no Storage API at all
  }
}

// One-off reclamation of the quota still held by pack zips from before packs
// moved to OPFS. Nothing reads that database.
export function purgeLegacyDatabase(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase('autogoon-goonpacks');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
