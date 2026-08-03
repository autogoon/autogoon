// What every experiment is, from the outside. One directory under
// experiments/, exporting these two functions —
// docs/2026-08-02-inference-ui-spec.md → Experiments. It is edited and re-run
// like any other code; what keeps its results readable is that each one records
// the version of the directory that produced it (fingerprint.ts).
//
// The split between them is the reason the raw reply is kept on disk. `run`
// sends the image and costs money. `parse` turns a stored reply into everything
// derived from it and costs nothing, so a parser that turns out to be wrong is
// fixed by walking the corpus calling `parse` alone, with no model involved.
//
// `parameters` are what the run is worth reading back in plain words — the
// model, the resolution, the temperature. Every result records the ones its own
// run used (runs.ts).

import type { Sidecar } from '@/lib/goonpacks/sidecar';
import type { FieldValue } from './fields';
import type { RunParameters } from './runs';

// What an experiment derives from one reply: the fields it is scored on, and
// the sidecar a pack could play. One function returns both, so no item can end
// up with fields and no description of what they were read from.
export type Inferred = {
  // A field the reply doesn't carry is absent rather than guessed: the run
  // still happened, the raw text is still on disk, and a better parser can fill
  // it later.
  fields: Record<string, FieldValue>;
  sidecar: Sidecar;
};

export type Experiment = {
  id: string;
  parameters: RunParameters;
  // What it asks the model, written beside every reply. The experiment's own
  // directory is not the copy: it is edited between runs, and a result whose
  // prompt has to be recovered by hashing the directory against git is a
  // result nobody will check.
  prompt: string;
  // The reply verbatim. Throws on anything that stopped a reply arriving —
  // missing key, unsupported file, an API error — so the caller reports it
  // rather than writing half a run.
  run: (imagePath: string) => Promise<string>;
  // Throws where the reply carries no prose at all: a caption is the one thing
  // an experiment cannot leave out, since a pack cannot play an item without
  // it.
  parse: (raw: string) => Inferred;
};
