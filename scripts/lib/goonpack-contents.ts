// What a build ships, decided before anything is validated or zipped: which of
// the source's files go in, and under what name.
//
// A pack source accumulates far more than a pack carries. Inference writes four
// files per item per run and keeps a copy of each under the run's own name
// (src/inference/paths.ts), and none of that belongs in something the app
// installs. What ships is the manifest, the system prompt, and **media that has
// a sidecar** — an undescribed picture is one no companion can pick, so its
// bytes buy nothing.
//
// `experiment` names whose descriptions to use. With one, an item's sidecar is
// its `<stem>.<experiment>.sidecar.md`, written into the zip under the plain
// `<stem>.md` a pack reads. Strictly that experiment's: an item it didn't
// describe is left out rather than falling back to a hand-written sidecar, so a
// pack built this way is one experiment's work throughout and a comparison
// between two of them is a comparison.
import {
  isJunkPath,
  MEDIA_TYPES,
  splitName,
} from '../../src/lib/goonpacks/media';
import { MANIFEST, MEDIA_DIR } from '../../src/lib/goonpacks/pack';
import { SIDECAR_EXT } from '../../src/lib/goonpacks/sidecar';
import { readName, sidecarName } from '../../src/inference/paths';

const PROMPT = 'system-prompt.md';

// One file in the zip: the name it takes there, and the file in the source it
// is read from. The two differ only for an experiment's sidecar.
export type Shipped = { entry: string; source: string };

// What is worth saying about a source once the zip's contents are settled.
// parsePack counts both of these, but neither reaches it — they are gone before
// it is handed anything — so a build's report of them comes from here or from
// nowhere.
//
// `undescribed` is media left behind for want of a sidecar. `strays` are names
// under media/ that belong to nothing: not media, not a sidecar, and not one of
// the files inference writes beside an item.
export type Contents = {
  files: Shipped[];
  undescribed: string[];
  strays: string[];
};

export function packContents(names: string[], experiment?: string): Contents {
  const files: Shipped[] = [];
  const undescribed: string[] = [];
  const strays: string[] = [];
  for (const top of [MANIFEST, PROMPT]) {
    if (names.includes(top)) files.push({ entry: top, source: top });
  }

  const here = new Set(names);
  const described = new Set<string>();
  for (const path of names) {
    if (!path.startsWith(MEDIA_DIR)) continue;
    const file = path.slice(MEDIA_DIR.length);
    const { stem, ext } = splitName(file);
    if (MEDIA_TYPES[ext] === undefined) continue;
    const wanted =
      experiment === undefined
        ? `${stem}.${SIDECAR_EXT}`
        : sidecarName(stem, experiment);
    if (!here.has(`${MEDIA_DIR}${wanted}`)) {
      undescribed.push(file);
      continue;
    }
    described.add(stem);
    files.push({ entry: path, source: path });
    files.push({
      entry: `${MEDIA_DIR}${stem}.${SIDECAR_EXT}`,
      source: `${MEDIA_DIR}${wanted}`,
    });
  }

  // A second pass, because whether a `<stem>.md` belongs to anything is only
  // known once every media file has been read.
  for (const path of names) {
    if (!path.startsWith(MEDIA_DIR) || isJunkPath(path)) continue;
    const file = path.slice(MEDIA_DIR.length);
    const { stem, ext } = splitName(file);
    if (MEDIA_TYPES[ext] !== undefined) continue;
    if (ext === SIDECAR_EXT && described.has(stem)) continue;
    if (readName(file) !== null) continue;
    strays.push(file);
  }
  return { files, undescribed, strays };
}
