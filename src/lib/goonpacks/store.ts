// Pack storage: IndexedDB holds ONE thing — each imported pack's zip bytes,
// keyed by pack id. Everything else (manifest, summary, validity) is
// re-derived from the zips at load by the same pipeline that imports them, so
// there is exactly one notion of a valid pack and no stored state to drift or
// migrate; a record that fails today's rules surfaces as incompatible, never
// half-works. The user's zip files remain the store of record — this is a
// cache ("Packs live in browser storage; keep your zips").

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

// A stored record, unvalidated: `zip` is whatever the browser hands back
// (records from older app versions may hold anything) — the load pipeline
// decides whether it parses.
export type PackRecord = { id: string; zip: unknown };

export async function listPackRecords(): Promise<PackRecord[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const s = t.objectStore(STORE);
      const keysReq = s.getAllKeys();
      const valsReq = s.getAll();
      t.oncomplete = () => {
        db.close();
        resolve(
          (keysReq.result as string[]).map((id, i) => ({
            id,
            zip: (valsReq.result as unknown[])[i],
          })),
        );
      };
      t.onerror = () => {
        db.close();
        reject(t.error ?? new Error("indexeddb failed"));
      };
      t.onabort = () => db.close();
    });
  } catch {
    return []; // no database, no packs
  }
}

export async function putPack(id: string, zip: ArrayBuffer): Promise<void> {
  await tx("readwrite", (s) => s.put(zip, id));
}

export async function deletePack(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function getPackBytes(id: string): Promise<ArrayBuffer | null> {
  try {
    const r: unknown = await tx("readonly", (s) => s.get(id));
    return r instanceof ArrayBuffer ? r : null;
  } catch {
    return null;
  }
}
