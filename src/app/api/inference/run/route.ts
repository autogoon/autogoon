// Running the current experiment against one item, and reading back what a
// previous run said about one.
//
// POST is the only paid path in the tool: one image, one call. Running the
// experiment across the corpus is a script rather than anything reachable from
// a click. Before spending anything it checks the experiment's parameters
// against the ones already recorded and refuses if they moved — a different
// model or resolution is a different experiment.

import {
  corpusPath,
  listCorpus,
  readLabels,
  readParameters,
  readRaw,
  readRun,
  writeLabels,
  writeParameters,
  writeRaw,
  writeRun,
} from '@/inference/corpus';
import { currentCommit } from '@/inference/commit';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { CURRENT, experimentById } from '@/inference/experiments';
import { fillAbsent } from '@/inference/labels';
import { checkParameters } from '@/inference/runs';

export const runtime = 'nodejs';

// What a previous run said about one item: its fields and the reply they came
// from. The raw reply is fetched only when an item is on screen, never as part
// of the listing — it is the largest thing the corpus holds.
export async function GET(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  const params = new URL(request.url).searchParams;
  const stem = params.get('stem');
  const id = params.get('experiment') ?? CURRENT.id;
  if (stem === null) return failed(new Error('No item was named.'));
  try {
    return Response.json({
      run: await readRun(stem, id),
      raw: await readRaw(stem, id),
    });
  } catch (e) {
    return failed(e);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  try {
    const body = (await request.json()) as {
      stem?: unknown;
      experiment?: unknown;
    };
    if (typeof body.stem !== 'string') {
      return failed(new Error('No item was named.'));
    }
    const experiment =
      typeof body.experiment === 'string'
        ? experimentById(body.experiment)
        : CURRENT;
    if (experiment === undefined) {
      return failed(
        new Error(`No such experiment: ${String(body.experiment)}.`),
      );
    }
    const item = (await listCorpus()).find((i) => i.stem === body.stem);
    if (item === undefined) return notFound();

    const recorded = await readParameters(experiment.id);
    if (recorded === null) {
      await writeParameters(experiment.id, experiment.parameters);
    } else {
      checkParameters(recorded, experiment.parameters);
    }

    const raw = await experiment.run(corpusPath(item.file));
    const fields = experiment.parse(raw);
    // The reply lands first: it is the thing that cost money, and everything
    // else is derived from it. A crash after this point loses no spend.
    await writeRaw(item.stem, experiment.id, raw);
    await writeRun(item.stem, experiment.id, {
      ranAt: new Date().toISOString(),
      commit: currentCommit(),
      fields,
    });
    const labels = fillAbsent(
      (await readLabels(item.stem)) ?? {},
      fields,
      experiment.id,
    );
    await writeLabels(item.stem, labels);

    return Response.json({ raw, fields, labels });
  } catch (e) {
    return failed(e);
  }
}
