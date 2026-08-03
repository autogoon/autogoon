// Run an experiment across the whole of one pack's corpus.
//
//   npm run experiment:run goonpacks/elise 2026-08-02-baseline
//       every item whose answers aren't the experiment's as it stands — the
//       ones it has never answered, and the ones it answered before its last
//       edit
//   npm run experiment:run:outdated goonpacks/elise 2026-08-02-baseline
//       only the second of those, leaving the never-answered alone
//   npm run experiment:run goonpacks/elise 2026-08-02-baseline 8
//       the same, eight items in flight rather than one
//
// Both report the whole standing before they start, because --outdated leaves
// a group behind and a count on its own doesn't say so.
//
// The pack and the experiment are both required, and neither has an "every
// pack" or "every experiment" form: an experiment spends per item, and the
// packs on a developer's disk hold thousands between them.
//
// This is the paid path at scale, so it says what it is about to run and against
// how many before it starts, and stops taking new items at the first failure
// rather than repeating it four hundred times. Items already done are skipped,
// so a stopped run is resumed by running it again.
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

// Filename order is not a random sample of a pack, so running in it would leave
// a sweep stopped part-way — and this one stops on the first failure — covering
// whatever sorts first. Those are the items the compare screen then calibrates
// against, so a spread across the pack is worth more than a reproducible order:
// a re-run picks up where the last stopped either way, since an item the
// experiment has answered is skipped. describe-missing.ts shuffles for the same
// reason.
const shuffled = <T>(items: T[]): T[] =>
  items
    .map((item) => ({ item, at: Math.random() }))
    .sort((a, b) => a.at - b.at)
    .map((e) => e.item);

// Where the corpus stands against one experiment, and which of it this run
// covers. The three counts are disjoint over the images: an item is one this
// experiment has never answered, or one whose answers came from the code as it
// stands, or one whose answers are older than the code.
type Sweep = {
  todo: CorpusItem[];
  answered: number;
  outdated: number;
  neverRun: number;
};

// Without --outdated a run brings the pack up to the experiment as it stands:
// everything it has never answered, and everything it answered before its last
// edit. With the flag it takes the second group alone, which is what to reach
// for when the gaps are deliberate — a corpus part-labelled on purpose — and
// re-running the stale answers is all that is wanted.
//
// A record from before versions were stamped counts as outdated: what produced
// it is unknown.
async function sweep(
  pack: string,
  items: CorpusItem[],
  experiment: string,
  version: string,
  onlyOutdated: boolean,
): Promise<Sweep> {
  const outdated: CorpusItem[] = [];
  const neverRun: CorpusItem[] = [];
  for (const item of items) {
    if (!item.runs.includes(experiment)) {
      neverRun.push(item);
      continue;
    }
    const run = await readRun(pack, item.stem, experiment);
    if (run === null || !isCurrent(run, version)) outdated.push(item);
  }
  return {
    todo: shuffled(onlyOutdated ? outdated : [...neverRun, ...outdated]),
    answered: items.length - neverRun.length,
    outdated: outdated.length,
    neverRun: neverRun.length,
  };
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
  const [named, asked, together] = args;
  if (named === undefined || asked === undefined) {
    console.error(
      'usage: experiment:run <pack directory> <experiment> [at once]',
    );
    process.exit(1);
  }
  // How many items are in flight. One by default, so the command you have been
  // typing keeps printing one item at a time in the order it ran them — the
  // number is what you reach for when a sweep is long enough to leave running.
  const atOnce = Math.floor(Number(together ?? 1));
  if (!Number.isFinite(atOnce) || atOnce < 1) {
    console.error(`${String(together)} isn't a number of items to run at once`);
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
  const { todo, answered, outdated, neverRun } = await sweep(
    pack,
    images,
    experiment.id,
    version,
    onlyOutdated,
  );

  // Where the corpus stands, then what this run takes of it — the second line
  // because --outdated leaves the never-run items behind, and a count on its
  // own reads as though it didn't.
  console.log(
    `${pack} · ${experiment.id} (${version}) — ${images.length} images · ${answered} answered · ${outdated} outdated · ${neverRun} never run`,
  );
  console.log(
    todo.length === 0
      ? 'nothing to run'
      : onlyOutdated
        ? `running ${todo.length} outdated, leaving ${neverRun} never run`
        : `running ${todo.length}: ${neverRun} never run and ${outdated} outdated`,
  );
  if (todo.length === 0) return;

  let done = 0;
  let taken = 0;
  // The first failure stops the sweep taking anything new. It is a missing key,
  // a refused request or a broken parser, and every remaining item would fail
  // the same way — but the calls already in flight are paid for, so they are
  // allowed to land rather than abandoned. Whatever finished is on disk, and
  // running again picks up where this left.
  let failure: unknown = null;

  const worker = async (): Promise<void> => {
    while (failure === null) {
      const item = todo[taken++];
      if (item === undefined) return;
      try {
        const { run } = await runItem(pack, experiment, item, version);
        const picture = inlineImage(
          (await readFile(corpusPath(pack, item.file))).toString('base64'),
        );
        // One write per item, so two finishing together don't interleave. The
        // caption rather than every field: it is the one answer condensed from
        // all of them, so a sweep reads as a page of sentences about pictures
        // rather than a page of JSON. The picture goes under it, the order
        // describe-missing prints in.
        console.log(
          [
            yellow(`${++done}/${todo.length} ${item.stem}`),
            dim(String(run.fields.caption ?? '(no caption)')),
            picture,
          ]
            .filter((line) => line !== '')
            .join('\n'),
        );
      } catch (e) {
        failure ??= e;
      }
    }
  };

  await Promise.all(Array.from({ length: atOnce }, worker));
  console.log(green(`${done} run against ${experiment.id}`));
  if (failure !== null) throw failure;
}

await main();
