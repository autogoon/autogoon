// The dev server's convenience: hand `.env`'s provider keys to the browser, so
// working locally doesn't mean pasting your own keys into your own app. The
// page reads this once at load and holds them for its lifetime — nothing is
// written to the browser, and readKeys() answers with them from then on
// (companions/keys.ts).
//
// One gate: it exists under `npm run dev` and nowhere else (IS_DEV — the same
// gate the inference routes use, for the same reason). No build serves it, so
// no deploy can hand a key out.
//
// It does NOT check where the request came from. The dev server binds 0.0.0.0,
// so anything on the network that can reach it can read these keys while it
// runs — a deliberate choice, because the only signal available here is the
// Host header, which the caller sets, and a check the caller can satisfy is
// worse than none: it reads as protection while refusing the phone you are
// actually testing on.
//
// A NEXT_PUBLIC_ variable would do the same job by inlining the keys into the
// build output, which is the one place they must never be.
import { IS_DEV, notFound } from '@/inference/dev-only';
import { DEFAULT_LLM_URL } from '@/lib/companions/keys';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  if (!IS_DEV) return notFound();
  return Response.json({
    openRouterKey: process.env.OPENROUTER_API_KEY ?? '',
    elevenLabsKey: process.env.ELEVENLABS_API_KEY ?? '',
    llmUrl: process.env.LLM_URL ?? DEFAULT_LLM_URL,
  });
}
