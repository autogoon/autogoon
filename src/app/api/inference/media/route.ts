// The bytes of one item, because the browser can't read the disk.
//
// The requested name is never joined to a path. It is matched against the
// listing and refused if absent, so no request can name a file outside
// inference-corpus/ however it is spelled.

import { readFile } from 'node:fs/promises';
import { corpusPath, listCorpus } from '@/inference/corpus';
import { failed, IS_DEV, notFound } from '@/inference/dev-only';
import { MEDIA_TYPES, splitName } from '@/lib/goonpacks/media';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  const file = new URL(request.url).searchParams.get('file');
  if (file === null) return failed(new Error('No file was named.'));
  try {
    const item = (await listCorpus()).find((i) => i.file === file);
    if (item === undefined) return notFound();
    const bytes = await readFile(corpusPath(item.file));
    const type = MEDIA_TYPES[splitName(item.file).ext];
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': type?.mimeType ?? 'application/octet-stream' },
    });
  } catch (e) {
    return failed(e);
  }
}
