// Running one experiment against one of a pack's items, and writing everything
// that falls out of it. The screen's Generate button and the sweep script both
// come through here, so a spot-check and a whole-corpus run leave the corpus in
// the same state.
//
// Server-only: it writes files.

import {
  corpusPath,
  readLabels,
  writeLabels,
  writeParameters,
  writeRaw,
  writeRun,
} from './corpus';
import type { Experiment } from './experiment';
import { fillAbsent, type Labels } from './labels';
import type { CorpusItem } from './item';
import type { RunFields } from './runs';

// The record as written, not as the caller would reconstruct it: `ranAt` is
// stamped here, and the screen showing a different one to the file would be a
// second answer to the same question.
export type RunResult = { raw: string; run: RunFields; labels: Labels };

export async function runItem(
  pack: string,
  experiment: Experiment,
  item: CorpusItem,
  // The experiment's version, passed rather than computed: a sweep hashes the
  // directory once and stamps every item it runs with the same answer.
  version: string,
): Promise<RunResult> {
  const raw = await experiment.run(corpusPath(pack, item.file));
  const fields = experiment.parse(raw);
  const run = { ranAt: new Date().toISOString(), version, fields };
  // The reply lands first: it is the thing that cost money, and everything
  // else is derived from it. A crash after this point loses no spend.
  await writeRaw(pack, item.stem, experiment.id, raw);
  await writeRun(pack, item.stem, experiment.id, run);
  // Rewritten every run, because it records what the last one used rather than
  // what the experiment is bound to.
  await writeParameters(pack, experiment.id, experiment.parameters);
  const labels = fillAbsent(
    (await readLabels(pack, item.stem)) ?? {},
    fields,
    experiment.id,
  );
  await writeLabels(pack, item.stem, labels);
  return { raw, run, labels };
}
