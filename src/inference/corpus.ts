// Reading and writing one pack's media/, which is where a corpus lives —
// INFERENCE.md says why there is no directory of its own for one. Every
// function takes the pack directory first, and packs.ts is what decides a name
// is one the caller may use. Server-only: everything here touches node's
// filesystem, and the panel reaches it over the routes rather than by importing
// it.
//
// The corpus's shape comes from **one readdir**. Every file is named from the
// item it belongs to (see paths.ts), so grouping the names says which items
// exist, which have a labels file and which experiments have answered them —
// with nothing opened and no stat per item.
//
// Which *fields* an item answers needs the labels file itself, so `survey`
// reads every one that exists, and one experiment's result per item alongside
// it. Both scale with what has been answered rather than with the corpus — an
// unlabelled item has no file to open — and one experiment rather than every
// one is what keeps the second read from being items × experiments. Nothing
// here is cached or indexed: the files are edited outside this app, so a stored
// summary would be wrong the moment one was.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CorpusItem, SurveyedItem } from './item';
import {
  fieldsName,
  labelsName,
  PACKS_DIR,
  promptName,
  rawName,
  readName,
  sidecarName,
  type RunStamp,
} from './paths';
import { MEDIA_NAME } from '@/lib/goonpacks/pack';
import { renderSidecar, type Sidecar } from '@/lib/goonpacks/sidecar';
import { parseLabels, renderLabels, type Labels } from './labels';
import { parseRunFields, renderRunFields, type RunFields } from './runs';

export const corpusPath = (pack: string, ...parts: string[]): string =>
  join(process.cwd(), PACKS_DIR, pack, MEDIA_NAME, ...parts);

// A pack's media/ listing, which is the whole of what the corpus is derived
// from. No directory there is an empty corpus, not a failure: the tool is how
// you find out you haven't put anything in one.
export async function mediaNames(pack: string): Promise<string[]> {
  try {
    return await readdir(corpusPath(pack));
  } catch {
    return [];
  }
}

// The pure half of the listing: a directory's names in, the corpus out. Names
// belonging to no item are dropped, and so is a labels or fields file whose
// media is gone — an orphan describes something that can't be shown, and
// surfacing it as an item would mean an entry with no picture.
export function groupNames(names: string[]): CorpusItem[] {
  const items = new Map<string, CorpusItem>();
  const labelled = new Set<string>();
  const answered = new Map<string, Set<string>>();

  for (const name of names) {
    const read = readName(name);
    if (read === null) continue;
    if (read.what === 'media') {
      items.set(read.stem, {
        stem: read.stem,
        file: read.file,
        kind: read.kind,
        hasLabels: false,
        runs: [],
      });
    } else if (read.what === 'labels') {
      labelled.add(read.stem);
    } else if (read.what === 'fields' && read.run === undefined) {
      // The latest only. An archived copy is kept for reading by hand and would
      // otherwise report an experiment as having answered an item it has since
      // been re-run against.
      const seen = answered.get(read.stem) ?? new Set<string>();
      seen.add(read.experiment);
      answered.set(read.stem, seen);
    }
  }

  for (const item of items.values()) {
    item.hasLabels = labelled.has(item.stem);
    item.runs = [...(answered.get(item.stem) ?? [])].sort();
  }
  return [...items.values()].sort((a, b) => a.stem.localeCompare(b.stem));
}

export const listCorpus = async (pack: string): Promise<CorpusItem[]> =>
  groupNames(await mediaNames(pack));

// The corpus with every existing labels file read, and one experiment's answers
// beside them. One pass, concurrent; a file that won't parse throws, naming
// itself, rather than being counted as absent — a label nobody can read is a
// label that needs fixing, not one to overlook.
export async function survey(
  pack: string,
  experiment: string,
): Promise<SurveyedItem[]> {
  const items = await listCorpus(pack);
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      labels: item.hasLabels ? await readLabelsNamed(pack, item.stem) : null,
      run: item.runs.includes(experiment)
        ? await readRun(pack, item.stem, experiment)
        : null,
    })),
  );
}

async function readLabelsNamed(
  pack: string,
  stem: string,
): Promise<Labels | null> {
  try {
    return await readLabels(pack, stem);
  } catch (e) {
    throw new Error(
      `${labelsName(stem)}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// Missing is null, not an error — an item with no ground truth yet is the
// ordinary case, and so is an experiment that hasn't run against one.
async function readIfPresent(
  pack: string,
  name: string,
): Promise<string | null> {
  try {
    return await readFile(corpusPath(pack, name), 'utf8');
  } catch {
    return null;
  }
}

export async function readLabels(
  pack: string,
  stem: string,
): Promise<Labels | null> {
  const text = await readIfPresent(pack, labelsName(stem));
  return text === null ? null : parseLabels(text);
}

export async function writeLabels(
  pack: string,
  stem: string,
  labels: Labels,
): Promise<void> {
  await writeFile(
    corpusPath(pack, labelsName(stem)),
    renderLabels(labels),
    'utf8',
  );
}

export async function readRun(
  pack: string,
  stem: string,
  experiment: string,
): Promise<RunFields | null> {
  const text = await readIfPresent(pack, fieldsName(stem, experiment));
  return text === null ? null : parseRunFields(text);
}

// The four writers an inference uses. Each takes an optional `run`: without
// one it writes the latest, with one the archived copy under a name carrying
// when the run happened and which version ran it (paths.ts). Only the latest is
// ever read back.
export async function writeRun(
  pack: string,
  stem: string,
  experiment: string,
  record: RunFields,
  run?: RunStamp,
): Promise<void> {
  await writeFile(
    corpusPath(pack, fieldsName(stem, experiment, run)),
    renderRunFields(record),
    'utf8',
  );
}

export const readRaw = (
  pack: string,
  stem: string,
  experiment: string,
): Promise<string | null> => readIfPresent(pack, rawName(stem, experiment));

export async function writeRaw(
  pack: string,
  stem: string,
  experiment: string,
  raw: string,
  run?: RunStamp,
): Promise<void> {
  await writeFile(
    corpusPath(pack, rawName(stem, experiment, run)),
    raw,
    'utf8',
  );
}

// What the experiment asked. Written beside the reply rather than left to the
// experiment's directory, because that directory is edited between runs.
export async function writePrompt(
  pack: string,
  stem: string,
  experiment: string,
  prompt: string,
  run?: RunStamp,
): Promise<void> {
  await writeFile(
    corpusPath(pack, promptName(stem, experiment, run)),
    prompt.endsWith('\n') ? prompt : `${prompt}\n`,
    'utf8',
  );
}

// The pack's own format, in the pack's own directory, under a name carrying the
// experiment that wrote it — so several experiments' descriptions of one
// picture sit beside each other and none of them is the one the pack plays.
export async function writeSidecar(
  pack: string,
  stem: string,
  experiment: string,
  sidecar: Sidecar,
  run?: RunStamp,
): Promise<void> {
  await writeFile(
    corpusPath(pack, sidecarName(stem, experiment, run)),
    renderSidecar(sidecar),
    'utf8',
  );
}
