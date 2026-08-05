// The bytes of one item, because the browser can't read the disk.
//
// Neither requested name is joined to a path. The pack is matched against the
// pack sources and the file against that pack's listing, each refused if
// absent, so no request can name a file outside a pack's media/ however it is
// spelled.

import { readFile } from 'node:fs/promises';
import { corpusPath, listCorpus } from '@/inference/corpus';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { packDirs, readPack } from '@/inference/packs';
import { MEDIA_TYPES, splitName } from '@/lib/goonpacks/media';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  const file = new URL(request.url).searchParams.get('file');
  if (file === null) return failed(new Error('No file was named.'));
  try {
    const pack = readPack(request, await packDirs());
    const item = (await listCorpus(pack)).find((i) => i.file === file);
    if (item === undefined) return notFound();
    const bytes = await readFile(corpusPath(pack, item.file));
    const type = MEDIA_TYPES[splitName(item.file).ext];
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': type?.mimeType ?? 'application/octet-stream' },
    });
  } catch (e) {
    return failed(e);
  }
}
