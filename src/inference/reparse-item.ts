// Deriving one item's answers again from the replies already on disk, with no
// model involved. This is the half of the run/parse split that makes keeping
// them worth it (experiment.ts): a parser that turns out to be wrong, or a
// field added to an experiment's output, is fixed here rather than paid for
// again.
//
// The latest files are rewritten; the archived copies are not. Those record
// what each run produced, and a reparse is not a run.
//
// Server-only: it writes files.

import { readExchanges, readRun, writeRun, writeSidecar } from './corpus';
import type { Exchange, Experiment } from './experiment';
import type { RunFields } from './runs';

// The same shape a run answers with, so the screen reads either without asking
// which it called. The exchanges are the stored ones — a reparse sends nothing.
export type ReparseResult = { exchanges: Exchange[]; run: RunFields };

// The record a reparse leaves. **When it ran, what ran it and what that run
// asked for all stand**: the fields are new, but the reply they were read from
// is the one that run produced, and stamping the current version would claim
// the model had answered under code it never saw.
export const reparsedRecord = (
  record: RunFields,
  fields: RunFields['fields'],
): RunFields => ({ ...record, fields });

export async function reparseItem(
  pack: string,
  experiment: Experiment,
  stem: string,
): Promise<ReparseResult> {
  const exchanges = await readExchanges(pack, stem, experiment.id);
  const last = exchanges[exchanges.length - 1];
  if (last === undefined) {
    throw new Error(`${experiment.id} has no stored reply for ${stem}.`);
  }
  // A reply with no record beside it is a run that stopped between writing the
  // two. What produced it is unknown, so there is nothing to re-derive against
  // — running it again is the fix.
  const record = await readRun(pack, stem, experiment.id);
  if (record === null) {
    throw new Error(`${experiment.id} has no record of the run for ${stem}.`);
  }
  const { fields, sidecar } = experiment.parse(last.reply);
  const run = reparsedRecord(record, fields);
  await writeRun(pack, stem, experiment.id, run);
  await writeSidecar(pack, stem, experiment.id, sidecar);
  return { exchanges, run };
}
