// What the screen may choose between: the pack sources holding a corpus, and
// the experiments that can be run over one. It is the first request the tab
// makes, because every other route needs both named.
//
// The experiment ids ride along rather than answering from a route of their
// own. The registry is server-only — an experiment module imports node's child
// process and filesystem to run a model — so the ids reach the browser only
// over a route, and the screen cannot ask for items until it holds one of each.

import { EXPERIMENTS } from '@/inference/experiments';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { listPacks } from '@/inference/packs';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  if (!IS_DEV) return notFound();
  try {
    return Response.json({
      packs: await listPacks(),
      experiments: EXPERIMENTS.map((e) => e.id),
    });
  } catch (e) {
    return failed(e);
  }
}
