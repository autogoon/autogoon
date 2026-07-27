// A pack source directory read whole: every file it holds, keyed by its
// '/'-separated path from the source root. The build validates this map and
// zips this map, so the tree parsePack judges is the tree that ships.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isJunkPath } from '../../src/lib/goonpacks/media';

export function collectPackFiles(dir: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  // A directory is recursed into, never read: readFileSync throws EISDIR on
  // one, and the paths below it are what lets parsePack name a folder that has
  // no place in a pack.
  const collect = (rel: string): void => {
    const entries = readdirSync(join(dir, rel === '' ? '.' : rel), {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const path = rel === '' ? e.name : `${rel}/${e.name}`;
      if (isJunkPath(path)) continue;
      if (e.isDirectory()) collect(path);
      else files[path] = new Uint8Array(readFileSync(join(dir, path)));
    }
  };
  collect('');
  return files;
}
