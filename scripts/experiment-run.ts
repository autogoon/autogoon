// Run an experiment across the whole of one pack's corpus.
//
//   npm run experiment:run goonpacks/elise 2026-08-02-baseline
//       every item that experiment hasn't answered
//   npm run experiment:run:outdated goonpacks/elise 2026-08-02-baseline
//       every item it answered under an older version of itself
//
// Both arguments are required, and neither has an "every pack" or "every
// experiment" form: this is one model call per item, and the packs on a
// developer's disk hold thousands between them.
//
// This is the paid path at scale — one model call per item — so it says what it
// is about to run and against how many before it starts, and stops on the first
// failure rather than repeating it four hundred times. Items already done are
// skipped, so a stopped run is resumed by running it again.
//
// Reads OPENROUTER_API_KEY / LLM_URL from the environment; the npm script loads
// .env via --env-file-if-exists.

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { corpusPath, listCorpus, readRun } from '../src/inference/corpus';
import { experimentById } from '../src/inference/experiments';
import { fingerprint } from '../src/inference/fingerprint';
import type { CorpusItem } from '../src/inference/item';
import { packDirs } from '../src/inference/packs';
import { runItem } from '../src/inference/run-item';
import { isCurrent } from '../src/inference/runs';
import { dim, green, inlineImage, yellow } from './describe-image';

const OUTDATED = '--outdated';

// Which items this run covers. Without --outdated that is everything the
// experiment has never answered; with it, everything it answered before its
// last edit — including records from before versions were stamped, since what
// produced those is unknown.
async function wanted(
  pack: string,
  items: CorpusItem[],
  experiment: string,
  version: string,
  onlyOutdated: boolean,
): Promise<CorpusItem[]> {
  const out: CorpusItem[] = [];
  for (const item of items) {
    const done = item.runs.includes(experiment);
    if (!onlyOutdated) {
      if (!done) out.push(item);
      continue;
    }
    if (!done) continue;
    const run = await readRun(pack, item.stem, experiment);
    if (run === null || !isCurrent(run, version)) out.push(item);
  }
  return out;
}

// The pack a path names, checked against the pack sources rather than followed.
// goonpack-build.ts takes a directory anywhere on disk; this one writes through
// corpusPath, which is rooted at goonpacks/, so a path leading elsewhere has
// nowhere to put what it produces.
async function packNamed(path: string): Promise<string> {
  const dir = basename(resolve(path));
  if ((await packDirs()).includes(dir)) return dir;
  console.error(`${path} isn't a pack source under goonpacks/`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== OUTDATED);
  const onlyOutdated = process.argv.slice(2).includes(OUTDATED);
  const [named, asked] = args;
  if (named === undefined || asked === undefined) {
    console.error('usage: experiment:run <pack directory> <experiment>');
    process.exit(1);
  }
  const pack = await packNamed(named);
  const experiment = experimentById(asked);
  if (experiment === undefined) {
    console.error(`No such experiment: ${asked}`);
    process.exit(1);
  }

  const version = await fingerprint(experiment.id);
  // Only images: an experiment sends a picture, and a video in the corpus is
  // there to be labelled by hand.
  const images = (await listCorpus(pack)).filter(
    (item) => item.kind === 'image',
  );
  const todo = await wanted(pack, images, experiment.id, version, onlyOutdated);

  console.log(
    `${pack} · ${experiment.id} (${version}) — ${todo.length} of ${images.length} ${
      onlyOutdated ? 'outdated' : 'unanswered'
    }`,
  );
  if (todo.length === 0) return;

  let done = 0;
  for (const item of todo) {
    console.log(yellow(`${done + 1}/${todo.length} ${item.stem}`));
    // No catch: a failure here is a missing key, a refused request or a broken
    // parser, and every remaining item would fail the same way. Whatever ran
    // before it is already on disk, so running again picks up where this left.
    const { run } = await runItem(pack, experiment, item, version);
    console.log(dim(JSON.stringify(run.fields)));
    // The picture under the answers, so a sweep can be read down the terminal
    // — the same order describe-missing prints in. Empty off iTerm.
    const picture = inlineImage(
      (await readFile(corpusPath(pack, item.file))).toString('base64'),
    );
    if (picture !== '') console.log(picture);
    done += 1;
  }
  console.log(green(`${done} run against ${experiment.id}`));
}

await main();
