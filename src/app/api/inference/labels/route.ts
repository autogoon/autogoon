// One reviewer's answer, written to an item's ground truth. Always stamps
// `human`, and always wins over whatever an experiment put there — confirming a
// seeded value and disagreeing with one go down the same path.
//
// Reading is not here: the listing already carries every item's labels, so a
// second reader would be a second answer to the same question.

import { listCorpus, readLabels, writeLabels } from '@/inference/corpus';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { fieldById } from '@/inference/fields';
import { answer } from '@/inference/labels';

export const runtime = 'nodejs';

export async function PUT(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  try {
    const body = (await request.json()) as {
      stem?: unknown;
      field?: unknown;
      value?: unknown;
    };
    if (typeof body.stem !== 'string' || typeof body.field !== 'string') {
      return failed(new Error('An answer needs a stem and a field.'));
    }
    if (typeof body.value !== 'boolean' && typeof body.value !== 'string') {
      return failed(new Error('An answer needs a value.'));
    }
    // The item has to exist and the field has to be one we ask about: a typo in
    // either would otherwise write a labels file nothing ever reads.
    const item = (await listCorpus()).find((i) => i.stem === body.stem);
    if (item === undefined) return notFound();
    if (fieldById(body.field) === undefined) {
      return failed(new Error(`No such field: ${body.field}.`));
    }
    const labels = answer(
      (await readLabels(item.stem)) ?? {},
      body.field,
      body.value,
    );
    await writeLabels(item.stem, labels);
    return Response.json({ labels });
  } catch (e) {
    return failed(e);
  }
}
