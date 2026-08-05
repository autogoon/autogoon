// Re-deriving one item's answers from the reply already stored, with no model
// call. A route of its own rather than a mode of `run`, so the free path and
// the paid one can't be reached by the same request with a flag wrong.

import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { experimentById } from '@/inference/experiments';
import { packDirs, readPack } from '@/inference/packs';
import { reparseItem } from '@/inference/reparse-item';

export const runtime = 'nodejs';

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
    return Response.json(await reparseItem(pack, experiment, body.stem));
  } catch (e) {
    return failed(e);
  }
}
