// A pack source on disk, as a pack. `parsePack` reads a tree — the names it
// holds and a way to read one as text (goonpacks/pack.ts) — and this is that
// tree for a directory under goonpacks/, so a source can be played without
// being zipped and imported first.
//
// The names are what the pack would ship, not what the directory holds: a pack
// source keeps an experiment's working files beside the media, and named with
// an experiment it is that experiment's sidecar an item is described by, under
// the plain `<stem>.md` a pack reads (pack-contents.ts).
//
// Every text comes back in one response rather than a read per name. Only three
// kinds of file are ever read as text — the manifest, the system prompt and the
// sidecars — so what crosses is a few kilobytes an item and no media at all,
// against a request each for a pack of several thousand sidecars.
//
// Server-only: it reads the developer's own filesystem, and the app reaches it
// over /api/inference/pack-tree, which is what resolves a pack name to the
// directory below.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MEDIA_TYPES, splitName } from '@/lib/goonpacks/media';
import { packContents } from './pack-contents';
import { collectPackFiles } from './pack-source';

// `names` is every file the pack carries, '/'-separated from its root. `texts`
// holds the ones a tree is asked to read, keyed by the same names — a name with
// no entry is a media file, whose bytes come from the media route instead.
export type PackTexts = {
  names: string[];
  texts: Record<string, string>;
};

// What a pack ships is media, or one of the three texts read to validate it, so
// "not media" is the same question as "read this one" and is asked the way
// packContents asks it.
const isText = (entry: string): boolean =>
  MEDIA_TYPES[splitName(entry).ext] === undefined;

// `dir` is a pack source directory, already resolved: which names a request may
// ask for is the route's, checked against the listing the way every other
// inference route checks one (packs.ts).
export async function packTree(
  dir: string,
  experiment?: string,
): Promise<PackTexts> {
  const { files } = packContents(await collectPackFiles(dir), experiment);
  const texts: Record<string, string> = {};
  await Promise.all(
    files
      .filter(({ entry }) => isText(entry))
      .map(async ({ entry, source }) => {
        texts[entry] = await readFile(join(dir, source), 'utf8');
      }),
  );
  return { names: files.map(({ entry }) => entry), texts };
}
