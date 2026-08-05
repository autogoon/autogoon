// One pack source as a pack: the names it would ship and the text of every file
// validation opens, so the app can play a directory under goonpacks/ without it
// being zipped and imported first.
//
// The pack is matched against the pack sources rather than joined to a path, so
// no request reaches a directory outside goonpacks/ however it is spelled — the
// rule the media route applies to a filename, a level up. `experiment` is not
// checked against the registry: a name nothing has run under simply describes
// no item, and the tree comes back with no media in it, which is the truthful
// answer rather than an error.

import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { packDirs, packPath, readPack } from '@/inference/packs';
import { packTree } from '@/inference/pack-tree';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  const experiment =
    new URL(request.url).searchParams.get('experiment') ?? undefined;
  try {
    const pack = readPack(request, await packDirs());
    return Response.json(await packTree(packPath(pack), experiment));
  } catch (e) {
    return failed(e);
  }
}
