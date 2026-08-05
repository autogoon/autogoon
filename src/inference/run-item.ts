// Running one experiment against one of a pack's items, and writing everything
// that falls out of it. The screen's Infer button and the sweep script both
// come through here, so a spot-check and a whole-corpus run leave the corpus in
// the same state.
//
// What it writes: a prompt and a reply for every call the experiment made,
// numbered by call; the fields read out of the last reply; and the sidecar —
// the pack's own format, so a described item is one a pack could play. Each is
// written twice, once under the plain name and once under one carrying when the
// run happened and which version ran it, so what an earlier version produced
// survives the next run (paths.ts).
//
// Ground truth is not among them: an experiment's answers are its own, and the
// screen lays them over what a person has said rather than the run writing into
// `<stem>.labels.json` (labels.ts).
//
// Server-only: it writes files.

import { corpusPath, writeExchange, writeRun, writeSidecar } from './corpus';
import type { Exchange, Experiment } from './experiment';
import type { CorpusItem } from './item';
import { runAt } from './paths';
import type { RunFields } from './runs';

// The record as written, not as the caller would reconstruct it: `ranAt` is
// stamped here, and the screen showing a different one to the file would be a
// second answer to the same question.
export type RunResult = { exchanges: Exchange[]; run: RunFields };

export async function runItem(
  pack: string,
  experiment: Experiment,
  item: CorpusItem,
  // The experiment's version, passed rather than computed: a sweep hashes the
  // directory once and stamps every item it runs with the same answer.
  version: string,
): Promise<RunResult> {
  const ranAt = new Date().toISOString();
  const { stem } = item;
  const id = experiment.id;
  const exchanges = await experiment.run(corpusPath(pack, item.file));
  const last = exchanges[exchanges.length - 1];
  if (last === undefined) {
    throw new Error(`${id} made no calls for ${stem}.`);
  }
  // What was spent lands first — every question and its answer. A crash after
  // this point loses no spend, and a parser that throws over replies already on
  // disk is fixed and re-derived.
  for (const [at, exchange] of exchanges.entries()) {
    await writeExchange(pack, stem, id, at + 1, exchange);
  }
  // The last reply, because the earlier ones are what the experiment worked
  // from rather than what it concluded.
  const { fields, sidecar } = experiment.parse(last.reply);
  const run = { ranAt, version, parameters: experiment.parameters, fields };
  await writeRun(pack, stem, id, run);
  await writeSidecar(pack, stem, id, sidecar);
  // All of it again under the run's own name, kept for reference. Nothing reads
  // those back — they are what a person opening the directory reads to see how
  // one picture's answers changed.
  const stamp = { at: runAt(ranAt), version };
  for (const [at, exchange] of exchanges.entries()) {
    await writeExchange(pack, stem, id, at + 1, exchange, stamp);
  }
  await writeRun(pack, stem, id, run, stamp);
  await writeSidecar(pack, stem, id, sidecar, stamp);
  return { exchanges, run };
}
