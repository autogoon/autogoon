// What store.ts guarantees about a pack tree's lifecycle: the marker is the
// only thing that says a tree is complete, the clean pass deletes every tree
// without one, and a tree another tab is writing is spared. Extraction into a
// tree is extract.test.ts's; reading a tree as a pack is pack.test.ts's.
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  MARKER,
  createPackDir,
  estimateHeadroom,
  hasMarker,
  importLock,
  listCompletePackKeys,
  listPackKeys,
  markComplete,
  openPackDir,
  openPackTree,
  readMediaFile,
  removePackTree,
  requestPersistence,
  sweepIncomplete,
} from './store';

// An in-memory OPFS: a directory is a Map, a file is its text. Only the members
// store.ts reaches for, so the casts stay narrow.
type Dir = Map<string, Dir | string>;

let root: Dir;
let heldLocks: Set<string>;
// Every removeEntry, as `<parent>/<child>` — removal's ordering is the whole
// crash-safety contract, and only the sequence shows it.
let removals: string[];
// Runs just before a lock request is granted, so a test can make the world
// change in the gap the sweep's second hasMarker() check exists for.
let beforeGrant: ((name: string) => void) | null;
let estimate: () => StorageEstimate;
// How many times persist() has been asked for, so a test can tell "resolved
// without waiting" from "never asked at all".
let persistCalls: number;

function fileHandle(parent: Dir, name: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => new File([String(parent.get(name) ?? '')], name),
    createWritable: async () => ({
      write: async (data: unknown) => void parent.set(name, String(data)),
      close: async () => {},
    }),
  } as unknown as FileSystemFileHandle;
}

function dirHandle(dir: Dir, name: string): FileSystemDirectoryHandle {
  const missing = () => new DOMException(`${name} not found`, 'NotFoundError');
  return {
    kind: 'directory',
    name,
    getDirectoryHandle: async (child: string, o?: { create?: boolean }) => {
      const at = dir.get(child);
      if (at instanceof Map) return dirHandle(at, child);
      if (at !== undefined || o?.create !== true) throw missing();
      const made: Dir = new Map();
      dir.set(child, made);
      return dirHandle(made, child);
    },
    getFileHandle: async (child: string, o?: { create?: boolean }) => {
      const at = dir.get(child);
      if (typeof at === 'string') return fileHandle(dir, child);
      if (at !== undefined || o?.create !== true) throw missing();
      dir.set(child, '');
      return fileHandle(dir, child);
    },
    removeEntry: async (child: string) => {
      removals.push(`${name}/${child}`);
      if (!dir.delete(child)) throw missing();
    },
    entries: async function* () {
      for (const [n, v] of [...dir]) {
        yield [n, v instanceof Map ? dirHandle(v, n) : fileHandle(dir, n)];
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

// A pack tree on disk: files by path, `media/x` nesting one level down.
function seed(key: string, files: Record<string, string>): void {
  const packs = (root.get('goonpacks') as Dir | undefined) ?? new Map();
  root.set('goonpacks', packs);
  const tree: Dir = new Map();
  packs.set(key, tree);
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split('/');
    let at = tree;
    for (const part of parts.slice(0, -1)) {
      const next = (at.get(part) as Dir | undefined) ?? new Map();
      at.set(part, next);
      at = next;
    }
    at.set(parts[parts.length - 1]!, text);
  }
}

const treeExists = (key: string): boolean =>
  (root.get('goonpacks') as Dir | undefined)?.has(key) === true;

beforeEach(() => {
  root = new Map();
  heldLocks = new Set();
  removals = [];
  beforeGrant = null;
  estimate = () => ({ quota: 10_000_000_000, usage: 0 });
  persistCalls = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        getDirectory: async () => dirHandle(root, ''),
        estimate: async () => estimate(),
        persisted: async () => false,
        // Never settles: Firefox resolves persist() only once the user answers
        // its permission prompt, which they may never do.
        persist: () => {
          persistCalls++;
          return new Promise<boolean>(() => {});
        },
      },
      locks: {
        request: async (
          name: string,
          opts: { ifAvailable?: boolean },
          cb: (lock: unknown) => Promise<unknown>,
        ) => {
          if (opts.ifAvailable === true && heldLocks.has(name)) return cb(null);
          beforeGrant?.(name);
          heldLocks.add(name);
          try {
            return await cb({ name });
          } finally {
            heldLocks.delete(name);
          }
        },
      },
    },
  });
});

describe('hasMarker', () => {
  it('reports a tree complete only once markComplete has written the marker', async () => {
    seed('pub.pack@1.0.0', { 'manifest.json': '{}' });
    expect(await hasMarker('pub.pack@1.0.0')).toBe(false);
    await markComplete('pub.pack@1.0.0');
    expect(await hasMarker('pub.pack@1.0.0')).toBe(true);
  });
});

describe('listCompletePackKeys', () => {
  it('offers only the trees carrying the marker, so a half-written pack is never read as installed', async () => {
    seed('pub.done@1.0.0', { 'manifest.json': '{}' });
    seed('pub.half@1.0.0', { 'manifest.json': '{}' });
    await markComplete('pub.done@1.0.0');
    expect(await listPackKeys()).toEqual(['pub.done@1.0.0', 'pub.half@1.0.0']);
    expect(await listCompletePackKeys()).toEqual(['pub.done@1.0.0']);
  });
});

describe('sweepIncomplete', () => {
  it('deletes a markerless tree, which is a crashed import or a crashed removal', async () => {
    seed('pub.crashed@1.0.0', { 'manifest.json': '{}' });
    expect(await sweepIncomplete()).toEqual(['pub.crashed@1.0.0']);
    expect(treeExists('pub.crashed@1.0.0')).toBe(false);
  });

  it('keeps a tree that carries the marker', async () => {
    seed('pub.done@1.0.0', { 'manifest.json': '{}' });
    await markComplete('pub.done@1.0.0');
    expect(await sweepIncomplete()).toEqual([]);
    expect(treeExists('pub.done@1.0.0')).toBe(true);
  });

  it('spares a markerless tree whose import lock another tab still holds', async () => {
    seed('pub.writing@1.0.0', { 'manifest.json': '{}' });
    heldLocks.add(importLock('pub.writing@1.0.0'));
    expect(await sweepIncomplete()).toEqual([]);
    expect(treeExists('pub.writing@1.0.0')).toBe(true);
  });

  it('spares a tree that gained its marker between the listing and the lock', async () => {
    seed('pub.racing@1.0.0', { 'manifest.json': '{}' });
    // The import finishes in the gap the sweep's second hasMarker() covers.
    beforeGrant = () => {
      ((root.get('goonpacks') as Dir).get('pub.racing@1.0.0') as Dir).set(
        MARKER,
        '',
      );
    };
    expect(await sweepIncomplete()).toEqual([]);
    expect(treeExists('pub.racing@1.0.0')).toBe(true);
  });
});

describe('removePackTree', () => {
  it('takes the marker off before the tree', async () => {
    seed('pub.going@1.0.0', { 'manifest.json': '{}' });
    await markComplete('pub.going@1.0.0');
    await removePackTree('pub.going@1.0.0');
    expect(removals).toEqual([
      `pub.going@1.0.0/${MARKER}`,
      'goonpacks/pub.going@1.0.0',
    ]);
  });

  it('leaves a markerless tree when interrupted, which is what the clean pass already deletes', async () => {
    seed('pub.going@1.0.0', { 'manifest.json': '{}' });
    await markComplete('pub.going@1.0.0');
    const packs = root.get('goonpacks') as Dir;
    const realDelete = packs.delete.bind(packs);
    // The tab dies after the marker goes but before the tree does.
    packs.delete = () => true;
    await removePackTree('pub.going@1.0.0');
    packs.delete = realDelete;

    expect(treeExists('pub.going@1.0.0')).toBe(true);
    expect(await hasMarker('pub.going@1.0.0')).toBe(false);
    expect(await sweepIncomplete()).toEqual(['pub.going@1.0.0']);
  });

  it('deletes the tree outright when nothing interrupts it', async () => {
    seed('pub.going@1.0.0', { 'manifest.json': '{}' });
    await markComplete('pub.going@1.0.0');
    await removePackTree('pub.going@1.0.0');
    expect(treeExists('pub.going@1.0.0')).toBe(false);
  });
});

describe('createPackDir', () => {
  it('replaces an existing tree, so a re-import never merges with what it replaces', async () => {
    seed('pub.pack@1.0.0', { 'manifest.json': '{}', 'media/old.jpg': 'x' });
    await createPackDir('pub.pack@1.0.0');
    const tree = (root.get('goonpacks') as Dir).get('pub.pack@1.0.0') as Dir;
    expect([...tree.keys()]).toEqual([]);
  });
});

describe('openPackDir', () => {
  it('names the pack as vanished from storage when its tree is gone', async () => {
    // A sibling, so goonpacks/ itself exists — without one packsRoot() comes
    // back null and the failure is the browser's, not this pack's.
    seed('pub.other@1.0.0', { 'manifest.json': '{}' });
    await expect(openPackDir('pub.pack@1.0.0')).rejects.toThrow(
      'The pack vanished from browser storage.',
    );
  });
});

describe('openPackTree', () => {
  it('lists a tree as root files plus media/, leaving macOS junk out', async () => {
    seed('pub.pack@1.0.0', {
      'manifest.json': '{"id":"pub.pack"}',
      '.DS_Store': 'junk',
      'media/a.jpg': '',
      'media/.DS_Store': 'junk',
    });
    const tree = await openPackTree('pub.pack@1.0.0');
    expect(tree?.names.sort()).toEqual(['manifest.json', 'media/a.jpg']);
  });

  it('reads a file back by its path', async () => {
    seed('pub.pack@1.0.0', { 'media/a.txt': 'a beach' });
    const tree = await openPackTree('pub.pack@1.0.0');
    expect(await tree?.readText('media/a.txt')).toBe('a beach');
  });

  it('has nothing to open for a key with no tree', async () => {
    expect(await openPackTree('pub.pack@1.0.0')).toBeNull();
  });
});

describe('readMediaFile', () => {
  it('hands back a media file from the pack it belongs to', async () => {
    seed('pub.pack@1.0.0', { 'media/a.jpg': 'bytes' });
    expect(await (await readMediaFile('pub.pack@1.0.0', 'a.jpg'))?.text()).toBe(
      'bytes',
    );
  });

  it('has nothing to hand back for a file the pack does not carry', async () => {
    seed('pub.pack@1.0.0', { 'media/a.jpg': 'bytes' });
    expect(await readMediaFile('pub.pack@1.0.0', 'gone.jpg')).toBeNull();
  });
});

describe('estimateHeadroom', () => {
  it('refuses a pack the free space would not cover with headroom to spare', async () => {
    estimate = () => ({ quota: 100_000_000, usage: 0 });
    expect(await estimateHeadroom(90_000_000)).toEqual({
      ok: false,
      available: 100_000_000,
    });
    expect((await estimateHeadroom(1_000)).ok).toBe(true);
  });

  it('reports storage as unusable when the browser will not estimate at all', async () => {
    estimate = () => {
      throw new Error('nope');
    };
    await expect(estimateHeadroom(1)).rejects.toThrow(
      "This browser can't store packs",
    );
  });
});

describe('requestPersistence', () => {
  // The timeout is the assertion: awaiting persist() would leave this pending
  // until jest gave up, which is what the first import would do on Firefox.
  it('resolves without waiting for persist() to settle', async () => {
    await expect(requestPersistence()).resolves.toBeUndefined();
    expect(persistCalls).toBe(1);
  }, 1_000);
});

describe('a browser that refuses a directory', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        storage: {
          getDirectory: async () => {
            throw new DOMException('denied', 'SecurityError');
          },
          estimate: async () => estimate(),
        },
      },
    });
  });

  it('leaves listPackKeys empty and openPackTree null, so reading is a library with no packs in it', async () => {
    expect(await listPackKeys()).toEqual([]);
    expect(await openPackTree('pub.pack@1.0.0')).toBeNull();
  });

  it("fails markComplete with the browser-can't-store-packs message", async () => {
    await expect(markComplete('pub.pack@1.0.0')).rejects.toThrow(
      "This browser can't store packs",
    );
  });
});
