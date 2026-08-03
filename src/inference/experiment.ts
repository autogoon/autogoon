// What every experiment is, from the outside. One directory under
// experiments/, exporting these two functions —
// docs/2026-08-02-inference-ui-spec.md → Experiments. It is edited and re-run
// like any other code; what keeps its results readable is that each one records
// the version of the directory that produced it (fingerprint.ts).
//
// The split between them is the reason the raw reply is kept on disk. `run`
// sends the image and costs money. `parse` turns a stored reply into fields and
// costs nothing, so a parser that turns out to be wrong is fixed by walking the
// corpus calling `parse` alone, with no model involved.
//
// `parameters` are what the run is worth reading back in plain words — the
// model, the resolution, the temperature. They are written to
// `<experiment>.run.json` every run, as a record of what the last one used.

import type { FieldValue } from './fields';
import type { RunParameters } from './runs';

export type Experiment = {
  id: string;
  parameters: RunParameters;
  // The reply verbatim. Throws on anything that stopped a reply arriving —
  // missing key, unsupported file, an API error — so the caller reports it
  // rather than writing half a run.
  run: (imagePath: string) => Promise<string>;
  // Fields this experiment can answer from a stored reply. A field the reply
  // doesn't carry is absent rather than guessed: the run still happened, the
  // raw text is still on disk, and a better parser can fill it later.
  parse: (raw: string) => Record<string, FieldValue>;
};
