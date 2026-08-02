// The corpus listing: every item, what exists beside it, and the ground truth
// it already carries. One request serves the summary's counts, the review
// screen's navigation and "next unanswered" alike — the whole thing is a
// readdir plus a read of the labels files that exist (see corpus.ts for what
// that costs).

import { survey } from '@/inference/corpus';
import { CURRENT } from '@/inference/experiments';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  if (!IS_DEV) return notFound();
  try {
    return Response.json({ items: await survey(), experiment: CURRENT.id });
  } catch (e) {
    return failed(e);
  }
}
