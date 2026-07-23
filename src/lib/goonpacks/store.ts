// Pack storage. IndexedDB is a CACHE keyed by pack id ({manifest, zip blob});
// the user's zip files are the store of record. localStorage carries a small
// derived index so startup can tell "evicted" from "never imported" — spec:
// "Eviction can be partial — never assume all-or-nothing."
import type { PackManifest } from "./manifest";
import { parseManifest } from "./manifest";

export type IndexEntry = {
  id: string;
  version: string;
  name?: string;
  base?: string;
};

const INDEX_KEY = "goonpacks:index";

export function toIndexEntry(m: PackManifest): IndexEntry {
  const e: IndexEntry = { id: m.id, version: m.version };
  if (m.name !== undefined) e.name = m.name;
  if (m.base !== undefined) e.base = m.base;
  return e;
}

export function readIndex(storage: Storage): IndexEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(INDEX_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is IndexEntry =>
        typeof e === "object" && e !== null && typeof e.id === "string",
    );
  } catch {
    return [];
  }
}

export function writeIndex(storage: Storage, entries: IndexEntry[]): void {
  try {
    storage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Quota/unavailable: the index is derived state; losing it only costs
    // "evicted vs never imported" hints, never data.
  }
}

// Stored records win over stale index entries; index entries with no record
// are the evicted ones the UI shows as awaiting re-import.
export function reconcile(
  index: IndexEntry[],
  stored: IndexEntry[],
): { healed: IndexEntry[]; missing: IndexEntry[] } {
  const storedById = new Map(stored.map((e) => [e.id, e]));
  const missing = index.filter((e) => !storedById.has(e.id));
  const healedIds = new Set<string>();
  const healed: IndexEntry[] = [];
  for (const e of [...stored, ...missing]) {
    if (healedIds.has(e.id)) continue;
    healedIds.add(e.id);
    healed.push(e);
  }
  return { healed, missing };
}

// --- IndexedDB (browser only, kept too thin to unit-test) ---

const DB_NAME = "autogoon-goonpacks";
const STORE = "packs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb open failed"));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("indexeddb failed"));
        // A failed request aborts the transaction — oncomplete never fires on
        // that path, so close on abort too or the connection leaks.
        t.oncomplete = () => db.close();
        t.onabort = () => db.close();
      }),
  );
}

type StoredRecord = { manifest: unknown; zip: Blob };

// Every readable, valid record's manifest. Unreadable/invalid records are
// skipped — they count as evicted and surface via reconcile as missing.
export async function listStoredManifests(): Promise<PackManifest[]> {
  let records: unknown[];
  try {
    records = await tx("readonly", (s) => s.getAll());
  } catch {
    return [];
  }
  const out: PackManifest[] = [];
  for (const r of records) {
    try {
      out.push(parseManifest((r as StoredRecord).manifest));
    } catch {
      // skip — treated as evicted
    }
  }
  return out;
}

export async function putPack(
  manifest: PackManifest,
  zip: Blob,
): Promise<void> {
  await tx("readwrite", (s) => s.put({ manifest, zip }, manifest.id));
}

export async function deletePack(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function getPackZip(id: string): Promise<Blob | null> {
  try {
    const r = (await tx("readonly", (s) => s.get(id))) as
      StoredRecord | undefined;
    return r?.zip ?? null;
  } catch {
    return null;
  }
}
