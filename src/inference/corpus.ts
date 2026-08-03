// Reading and writing inference-corpus/. Server-only: everything here touches
// node's filesystem, and the panel reaches it over the routes rather than by
// importing it.
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
  CORPUS_DIR,
  fieldsName,
  labelsName,
  rawName,
  readName,
  runName,
} from './paths';
import { parseLabels, renderLabels, type Labels } from './labels';
import {
  parseRunFields,
  renderParameters,
  renderRunFields,
  type RunFields,
  type RunParameters,
} from './runs';

export const corpusPath = (...parts: string[]): string =>
  join(process.cwd(), CORPUS_DIR, ...parts);

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
    } else if (read.what === 'fields') {
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

export async function listCorpus(): Promise<CorpusItem[]> {
  let names: string[];
  try {
    names = await readdir(corpusPath());
  } catch {
    // No corpus directory yet is an empty corpus, not a failure: the tool is
    // how you find out you haven't made one.
    return [];
  }
  return groupNames(names);
}

// The corpus with every existing labels file read, and one experiment's answers
// beside them. One pass, concurrent; a file that won't parse throws, naming
// itself, rather than being counted as absent — a label nobody can read is a
// label that needs fixing, not one to overlook.
export async function survey(experiment: string): Promise<SurveyedItem[]> {
  const items = await listCorpus();
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      labels: item.hasLabels ? await readLabelsNamed(item.stem) : null,
      run: item.runs.includes(experiment)
        ? await readRun(item.stem, experiment)
        : null,
    })),
  );
}

async function readLabelsNamed(stem: string): Promise<Labels | null> {
  try {
    return await readLabels(stem);
  } catch (e) {
    throw new Error(
      `${labelsName(stem)}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// Missing is null, not an error — an item with no ground truth yet is the
// ordinary case, and so is an experiment that hasn't run against one.
async function readIfPresent(name: string): Promise<string | null> {
  try {
    return await readFile(corpusPath(name), 'utf8');
  } catch {
    return null;
  }
}

export async function readLabels(stem: string): Promise<Labels | null> {
  const text = await readIfPresent(labelsName(stem));
  return text === null ? null : parseLabels(text);
}

export async function writeLabels(stem: string, labels: Labels): Promise<void> {
  await writeFile(corpusPath(labelsName(stem)), renderLabels(labels), 'utf8');
}

export async function readRun(
  stem: string,
  experiment: string,
): Promise<RunFields | null> {
  const text = await readIfPresent(fieldsName(stem, experiment));
  return text === null ? null : parseRunFields(text);
}

export async function writeRun(
  stem: string,
  experiment: string,
  run: RunFields,
): Promise<void> {
  await writeFile(
    corpusPath(fieldsName(stem, experiment)),
    renderRunFields(run),
    'utf8',
  );
}

export const readRaw = (
  stem: string,
  experiment: string,
): Promise<string | null> => readIfPresent(rawName(stem, experiment));

export async function writeRaw(
  stem: string,
  experiment: string,
  raw: string,
): Promise<void> {
  await writeFile(corpusPath(rawName(stem, experiment)), raw, 'utf8');
}

// Written, never read back: `<experiment>.run.json` records what the last run
// used for whoever opens the corpus, and what says whether a result is current
// is the version stamped on the result itself.
export async function writeParameters(
  experiment: string,
  parameters: RunParameters,
): Promise<void> {
  await writeFile(
    corpusPath(runName(experiment)),
    renderParameters(parameters),
    'utf8',
  );
}
