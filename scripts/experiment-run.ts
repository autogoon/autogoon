// Run an experiment across the whole corpus.
//
//   npm run experiment:run                        every item it hasn't answered
//   npm run experiment:run 2026-08-02-baseline    that experiment, not CURRENT
//   npm run experiment:run:outdated               every item it answered under
//                                                 an older version of itself
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
import { corpusPath, listCorpus, readRun } from '../src/inference/corpus';
import { CURRENT, experimentById } from '../src/inference/experiments';
import { fingerprint } from '../src/inference/fingerprint';
import type { CorpusItem } from '../src/inference/item';
import { runItem } from '../src/inference/run-item';
import { isCurrent } from '../src/inference/runs';
import { dim, green, inlineImage, yellow } from './describe-image';

const OUTDATED = '--outdated';

// Which items this run covers. Without --outdated that is everything the
// experiment has never answered; with it, everything it answered before its
// last edit — including records from before versions were stamped, since what
// produced those is unknown.
async function wanted(
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
    const run = await readRun(item.stem, experiment);
    if (run === null || !isCurrent(run, version)) out.push(item);
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyOutdated = args.includes(OUTDATED);
  const asked = args.find((a) => a !== OUTDATED);
  const experiment = asked === undefined ? CURRENT : experimentById(asked);
  if (experiment === undefined) {
    console.error(`No such experiment: ${asked}`);
    process.exit(1);
  }

  const version = await fingerprint(experiment.id);
  // Only images: an experiment sends a picture, and a video in the corpus is
  // there to be labelled by hand.
  const images = (await listCorpus()).filter((item) => item.kind === 'image');
  const todo = await wanted(images, experiment.id, version, onlyOutdated);

  console.log(
    `${experiment.id} (${version}) — ${todo.length} of ${images.length} ${
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
    const { run } = await runItem(experiment, item, version);
    console.log(dim(JSON.stringify(run.fields)));
    // The picture under the answers, so a sweep can be read down the terminal
    // — the same order describe-missing prints in. Empty off iTerm.
    const picture = inlineImage(
      (await readFile(corpusPath(item.file))).toString('base64'),
    );
    if (picture !== '') console.log(picture);
    done += 1;
  }
  console.log(green(`${done} run against ${experiment.id}`));
}

await main();
