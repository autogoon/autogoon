// A pack source directory walked whole: the '/'-separated path of every file it
// holds, from the source root. Nothing is filtered — what the zip carries is
// what the directory carries, so building a pack and zipping the directory by
// hand produce the same archive. parsePack drops macOS junk itself before it
// judges anything, so leaving it in changes no verdict.
import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// What an entry resolves to, which is not what readdir calls it: a symlink is
// reported as a symlink whatever it points at, and a media/ symlinked to a set
// living elsewhere on disk is a directory to everything downstream. `stat`
// follows the link, and throws for one pointing at nothing — a broken symlink
// is a file as far as this is concerned, and parsePack judges the name.
async function resolvesToDirectory(
  entry: Dirent,
  full: string,
): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return (await stat(full)).isDirectory();
  } catch {
    return false;
  }
}

export async function collectPackFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  // A directory is recursed into rather than listed as one of the files: the
  // paths below it are what lets parsePack name a folder that has no place in
  // a pack.
  const collect = async (rel: string): Promise<void> => {
    const entries = (
      await readdir(join(dir, rel === '' ? '.' : rel), {
        withFileTypes: true,
      })
    ).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const path = rel === '' ? e.name : `${rel}/${e.name}`;
      const full = join(dir, path);
      if (await resolvesToDirectory(e, full)) await collect(path);
      else files.push(path);
    }
  };
  await collect('');
  return files;
}
