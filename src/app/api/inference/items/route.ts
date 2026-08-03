// One pack's corpus listing: every item, what exists beside it, the ground
// truth it already carries, and one experiment's answers for it. One request
// serves the summary's counts, the review screen's navigation and "next
// unanswered" alike — the whole thing is a readdir plus a read of the label and
// result files that exist (see corpus.ts for what that costs).
//
// It is scoped to one pack and one experiment, named by `?pack=` and
// `?experiment=`, because the screen examines one of each at a time. The
// version of that experiment goes back with it, so the screen can say which of
// its results the code on disk would still produce.

import { survey } from '@/inference/corpus';
import { experimentById } from '@/inference/experiments';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { fingerprint } from '@/inference/fingerprint';
import { packDirs, readPack } from '@/inference/packs';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  const asked = new URL(request.url).searchParams.get('experiment');
  const experiment = asked === null ? undefined : experimentById(asked);
  if (experiment === undefined) {
    return failed(new Error(`No such experiment: ${String(asked)}.`));
  }
  try {
    const pack = readPack(request, await packDirs());
    return Response.json({
      items: await survey(pack, experiment.id),
      version: await fingerprint(experiment.id),
    });
  } catch (e) {
    return failed(e);
  }
}
