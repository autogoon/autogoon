// The corpus listing: every item, what exists beside it, the ground truth it
// already carries, and one experiment's answers for it. One request serves the
// summary's counts, the review screen's navigation and "next unanswered" alike
// — the whole thing is a readdir plus a read of the label and result files that
// exist (see corpus.ts for what that costs).
//
// It is scoped to one experiment, named by `?experiment=`, because the screen
// examines one at a time. The version of that experiment goes back with it, so
// the screen can say which of its results the code on disk would still produce.

import { survey } from '@/inference/corpus';
import { CURRENT, EXPERIMENTS, experimentById } from '@/inference/experiments';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { fingerprint } from '@/inference/fingerprint';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  const asked = new URL(request.url).searchParams.get('experiment');
  const experiment = asked === null ? CURRENT : experimentById(asked);
  if (experiment === undefined) {
    return failed(new Error(`No such experiment: ${String(asked)}.`));
  }
  try {
    return Response.json({
      items: await survey(experiment.id),
      // The registry's ids fill the screen's experiment picker, and CURRENT is
      // what it starts on.
      experiments: EXPERIMENTS.map((e) => e.id),
      experiment: experiment.id,
      version: await fingerprint(experiment.id),
    });
  } catch (e) {
    return failed(e);
  }
}
