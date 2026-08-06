// One reviewer's answer, written to an item's ground truth. PUT always wins
// over whatever an experiment put there — confirming a
// seeded value and disagreeing with one go down the same path. DELETE takes an
// answer back, returning the field to absent.
//
// Reading is not here: the listing already carries every item's labels, so a
// second reader would be a second answer to the same question.

import { listCorpus, readLabels, writeLabels } from '@/inference/corpus';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { fieldById } from '@/inference/fields';
import { answer, clear } from '@/inference/labels';
import { packDirs, readPack } from '@/inference/packs';

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
    const pack = readPack(request, await packDirs());
    const item = (await listCorpus(pack)).find((i) => i.stem === body.stem);
    if (item === undefined) return notFound();
    if (fieldById(body.field) === undefined) {
      return failed(new Error(`No such field: ${body.field}.`));
    }
    const labels = answer(
      (await readLabels(pack, item.stem)) ?? {},
      body.field,
      body.value,
    );
    await writeLabels(pack, item.stem, labels);
    return Response.json({ labels });
  } catch (e) {
    return failed(e);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  const params = new URL(request.url).searchParams;
  const stem = params.get('stem');
  const field = params.get('field');
  if (stem === null || field === null) {
    return failed(new Error('Taking an answer back needs a stem and a field.'));
  }
  try {
    const pack = readPack(request, await packDirs());
    const item = (await listCorpus(pack)).find((i) => i.stem === stem);
    if (item === undefined) return notFound();
    // No check that the field is one we ask about, unlike PUT: removing an
    // answer to a field the set no longer has is how a renamed field's leavings
    // get cleaned up.
    const labels = clear((await readLabels(pack, item.stem)) ?? {}, field);
    await writeLabels(pack, item.stem, labels);
    return Response.json({ labels });
  } catch (e) {
    return failed(e);
  }
}
