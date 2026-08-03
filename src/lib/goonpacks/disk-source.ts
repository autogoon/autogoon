// The pack library over pack sources sitting on the developer's disk, rather
// than over packs unpacked into OPFS. One LibrarySource, so buildLibrary and
// parsePack judge a directory by exactly the rules they judge an installed pack
// by — there is no second notion of a valid pack, and no second index.
//
// It stands on two dev-only routes: /api/inference/pack-tree for the names and
// texts (pack-tree.ts), /api/inference/media for the bytes. Both answer under
// `npm run dev` and nowhere else, so this source is only ever built where they
// do (src/inference/dev-only.ts).
//
// A pack's key is inside its manifest, which is inside its tree, so listKeys
// has to read every chosen pack before it can name one. It fetches each once
// and holds it for the openTree that follows — one request per pack, not one
// per sidecar.

import { packKey } from './entries';
import type { LibrarySource } from './library';
import type { PackTree, ParsedMedia } from './pack';

// A pack source to offer, and whose descriptions to play it with. `experiment`
// absent takes the hand-written sidecars, the same choice goonpack:build makes
// when its second argument is left off.
export type DiskChoice = { dir: string; experiment?: string };

// What the pack-tree route answers with: every name the pack would ship, and
// the text of the ones validation opens.
type PackTexts = { names: string[]; texts: Record<string, string> };

const MANIFEST = 'manifest.json';

const treeUrl = ({ dir, experiment }: DiskChoice): string => {
  const at =
    experiment === undefined
      ? ''
      : `&experiment=${encodeURIComponent(experiment)}`;
  return `/api/inference/pack-tree?pack=${encodeURIComponent(dir)}${at}`;
};

// The key a tree's own manifest claims. A tree whose manifest is missing or
// unreadable is left out of the listing rather than thrown: it is a directory
// under goonpacks/ that isn't a pack, and buildLibrary's job is the packs that
// are there. What a manifest with the wrong *contents* says is parsePack's, and
// that runs on everything this does list.
function keyOf(tree: PackTexts): string | null {
  const text = tree.texts[MANIFEST];
  if (text === undefined) return null;
  try {
    const m: unknown = JSON.parse(text);
    if (typeof m !== 'object' || m === null) return null;
    const { id, version } = m as { id?: unknown; version?: unknown };
    if (typeof id !== 'string' || typeof version !== 'string') return null;
    return packKey({ id, version });
  } catch {
    return null;
  }
}

export function diskSource(choices: readonly DiskChoice[]): LibrarySource {
  // Filled by listKeys and read by openTree and mediaUrl. buildLibrary calls
  // them in that order, and a source is built fresh for each index, so this
  // never has to answer for a listing it didn't take.
  const held = new Map<string, { choice: DiskChoice; tree: PackTexts }>();

  return {
    listKeys: async () => {
      held.clear();
      const read = await Promise.all(
        choices.map(async (choice) => {
          const response = await fetch(treeUrl(choice));
          if (!response.ok) return null;
          const tree = (await response.json()) as PackTexts;
          const key = keyOf(tree);
          return key === null ? null : { key, choice, tree };
        }),
      );
      for (const found of read) {
        if (found !== null) held.set(found.key, found);
      }
      return [...held.keys()];
    },

    openTree: (key) => {
      const found = held.get(key);
      if (found === undefined) return Promise.resolve(null);
      const tree: PackTree = {
        names: found.tree.names,
        // Every name parsePack reads came down with the listing. One it didn't
        // is media, which parsePack never opens as text — an empty string is
        // what a tree over a plain object gives for the same name.
        readText: (path) => Promise.resolve(found.tree.texts[path] ?? ''),
      };
      return Promise.resolve(tree);
    },

    // The route takes the directory the pack was read from, not its key: a
    // source directory is named by what it is called on disk, and two versions
    // of a pack are two directories.
    mediaUrl: (key: string, media: ParsedMedia) => {
      const found = held.get(key);
      if (found === undefined) {
        return Promise.reject(new Error(`missing media: ${key}/${media.file}`));
      }
      const pack = encodeURIComponent(found.choice.dir);
      const file = encodeURIComponent(media.file);
      return Promise.resolve(`/api/inference/media?pack=${pack}&file=${file}`);
    },
  };
}
