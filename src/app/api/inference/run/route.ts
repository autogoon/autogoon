// Running one experiment against one item, and reading back what a previous run
// said about one.
//
// POST is the only paid path reachable from a click: one image, one call, as
// the spot-check. Running an experiment across the corpus is `npm run
// experiment:run`, which comes through the same runItem.

import { listCorpus, readExchanges, readRun } from '@/inference/corpus';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { experimentById } from '@/inference/experiments';
import { fingerprint } from '@/inference/fingerprint';
import { packDirs, readPack } from '@/inference/packs';
import { runItem } from '@/inference/run-item';

export const runtime = 'nodejs';

// What a previous run said about one item: its fields, and every call it made
// as a question and its answer. The exchanges are fetched only when an item is
// on screen, never as part of the listing — they are the largest thing the
// corpus holds.
export async function GET(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  const params = new URL(request.url).searchParams;
  const stem = params.get('stem');
  const id = params.get('experiment');
  if (stem === null) return failed(new Error('No item was named.'));
  if (id === null) return failed(new Error('No experiment was named.'));
  try {
    const pack = readPack(request, await packDirs());
    return Response.json({
      run: await readRun(pack, stem, id),
      exchanges: await readExchanges(pack, stem, id),
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
        : undefined;
    if (experiment === undefined) {
      return failed(
        new Error(`No such experiment: ${String(body.experiment)}.`),
      );
    }
    const pack = readPack(request, await packDirs());
    const item = (await listCorpus(pack)).find((i) => i.stem === body.stem);
    if (item === undefined) return notFound();
    const version = await fingerprint(experiment.id);
    return Response.json(await runItem(pack, experiment, item, version));
  } catch (e) {
    return failed(e);
  }
}
