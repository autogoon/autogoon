// Which pack sources under goonpacks/ hold a corpus, and which name a request
// may use. Server-only: it reads the developer's own filesystem, and the panel
// reaches it over /api/inference/packs.
//
// Two listings, because the picker and the guard want different work. `listPacks`
// reads every pack's media/ to count what is in it, which is what fills the
// picker; `packDirs` stats one file per entry and is what a request's pack name
// is matched against. Neither is cached: the directories are edited outside this
// app, so a stored list would be wrong the moment one was.

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MANIFEST } from '@/lib/goonpacks/pack';
import { mediaNames } from './corpus';
import type { PackSource } from './item';
import { PACKS_DIR, readName } from './paths';

const packsPath = (...parts: string[]): string =>
  join(process.cwd(), PACKS_DIR, ...parts);

// How many of a media directory's names name an item. Zero means the directory
// holds no corpus, whatever else is in it.
export const countItems = (names: string[]): number =>
  names.filter((name) => readName(name)?.what === 'media').length;

// Every pack source, by the test goonpack-build.ts applies: a manifest.json
// under the name. Statting that rather than asking whether the entry is a
// directory is also what follows a symlinked pack — a file cannot have a path
// beneath it, so the stat answers both questions at once.
export async function packDirs(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(packsPath());
  } catch {
    return [];
  }
  const found = await Promise.all(
    entries.map(async (name) => {
      try {
        await stat(packsPath(name, MANIFEST));
        return name;
      } catch {
        return null;
      }
    }),
  );
  return found.filter((name) => name !== null).sort();
}

// The pack sources the picker offers. A pack whose media/ holds no item opens
// on nothing, so it is left out rather than listed as an empty corpus.
export async function listPacks(): Promise<PackSource[]> {
  const dirs = await packDirs();
  const packs = await Promise.all(
    dirs.map(async (dir) => ({
      dir,
      items: countItems(await mediaNames(dir)),
    })),
  );
  return packs.filter((pack) => pack.items > 0);
}

// The pack a request names, matched against the listing and never joined to a
// path — the rule the media route applies to a filename, a level up. A name
// `dirs` doesn't hold throws rather than resolving to a directory outside
// goonpacks/, however it is spelled.
export function readPack(request: Request, dirs: string[]): string {
  const pack = new URL(request.url).searchParams.get('pack');
  if (pack === null) throw new Error('No pack was named.');
  if (!dirs.includes(pack)) throw new Error(`No such pack: ${pack}.`);
  return pack;
}
