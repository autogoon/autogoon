// A pack source directory read whole: every file it holds, keyed by its
// '/'-separated path from the source root. Nothing is filtered — what the zip
// carries is what the directory carries, so building a pack and zipping the
// directory by hand produce the same archive. parsePack drops macOS junk itself
// before it judges anything, so leaving it in changes no verdict.
import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

// What an entry resolves to, which is not what readdirSync calls it: a symlink
// is reported as a symlink whatever it points at, and a media/ symlinked to a
// set living elsewhere on disk is a directory to everything downstream.
// statSync follows the link.
const resolvesToDirectory = (entry: Dirent, full: string): boolean =>
  entry.isDirectory() ||
  (entry.isSymbolicLink() &&
    statSync(full, { throwIfNoEntry: false })?.isDirectory() === true);

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
      const full = join(dir, path);
      if (resolvesToDirectory(e, full)) collect(path);
      else files[path] = new Uint8Array(readFileSync(full));
    }
  };
  collect('');
  return files;
}
