// The dev server's convenience: hand `.env`'s provider keys to the browser, so
// working locally doesn't mean pasting your own keys into your own app. Settings
// reads this once, on a button, and stores what comes back exactly where a
// pasted key goes — after which every call site has one path, and no key of the
// server's is involved again.
//
// Two gates, because this route gives a key away rather than spending one:
//
//   - It exists under `npm run dev` and nowhere else (IS_DEV — the same gate the
//     inference routes use, for the same reason).
//   - It answers loopback only. The dev server binds 0.0.0.0, so without this
//     anyone on the network could take the key rather than merely spend it.
//
// A NEXT_PUBLIC_ variable would do the same job by inlining the keys into the
// build output, which is the one place they must never be.
import { IS_DEV, notFound } from '@/inference/dev-only';
import { DEFAULT_LLM_URL } from '@/lib/companions/keys';

export const runtime = 'nodejs';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export async function GET(request: Request): Promise<Response> {
  if (!IS_DEV) return notFound();
  // The host the request was addressed to: a LAN request names the machine's
  // address, a local one names loopback. Unparseable is refused with the rest.
  let hostname: string;
  try {
    hostname = new URL(request.url).hostname;
  } catch {
    return notFound();
  }
  if (!LOOPBACK.has(hostname)) return notFound();

  return Response.json({
    openRouterKey: process.env.OPENROUTER_API_KEY ?? '',
    elevenLabsKey: process.env.ELEVENLABS_API_KEY ?? '',
    llmUrl: process.env.LLM_URL ?? DEFAULT_LLM_URL,
  });
}
