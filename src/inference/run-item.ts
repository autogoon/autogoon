// Running one experiment against one of a pack's items, and writing everything
// that falls out of it. The screen's Infer button and the sweep script both
// come through here, so a spot-check and a whole-corpus run leave the corpus in
// the same state.
//
// Four files: the prompt it sent, the reply verbatim, the fields read out of
// that reply, and the sidecar — the pack's own format, so a described item is
// one a pack could play. Each is written twice, once under the plain name and
// once under one carrying when the run happened and which version ran it, so
// what an earlier version produced survives the next run (paths.ts).
//
// Ground truth is not among them: an experiment's answers are its own, and the
// screen lays them over what a person has said rather than the run writing into
// `<stem>.labels.json` (labels.ts).
//
// Server-only: it writes files.

import {
  corpusPath,
  writePrompt,
  writeRaw,
  writeRun,
  writeSidecar,
} from './corpus';
import type { Experiment } from './experiment';
import type { CorpusItem } from './item';
import { runAt } from './paths';
import type { RunFields } from './runs';

// The record as written, not as the caller would reconstruct it: `ranAt` is
// stamped here, and the screen showing a different one to the file would be a
// second answer to the same question.
export type RunResult = { raw: string; run: RunFields };

export async function runItem(
  pack: string,
  experiment: Experiment,
  item: CorpusItem,
  // The experiment's version, passed rather than computed: a sweep hashes the
  // directory once and stamps every item it runs with the same answer.
  version: string,
): Promise<RunResult> {
  const ranAt = new Date().toISOString();
  const raw = await experiment.run(corpusPath(pack, item.file));
  // The reply lands first: it is the thing that cost money, and everything else
  // is derived from it. A crash after this point loses no spend, and a parser
  // that throws over a reply already on disk is fixed and re-derived.
  await writeRaw(pack, item.stem, experiment.id, raw);
  const { fields, sidecar } = experiment.parse(raw);
  const run = { ranAt, version, parameters: experiment.parameters, fields };
  const { stem } = item;
  const id = experiment.id;
  await writePrompt(pack, stem, id, experiment.prompt);
  await writeRun(pack, stem, id, run);
  await writeSidecar(pack, stem, id, sidecar);
  // The same four again under the run's own name, kept for reference. Nothing
  // reads them back — they are what a person opening the directory reads to see
  // how one picture's answers changed.
  const stamp = { at: runAt(ranAt), version };
  await writePrompt(pack, stem, id, experiment.prompt, stamp);
  await writeRaw(pack, stem, id, raw, stamp);
  await writeRun(pack, stem, id, run, stamp);
  await writeSidecar(pack, stem, id, sidecar, stamp);
  return { raw, run };
}
