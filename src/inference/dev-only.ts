// The gate on every inference route. The tool edits files on the machine
// holding them, so it exists under `npm run dev` and nowhere else —
// roadmap/GOONPACK-KIT.md calls this "the first design question, and it is not
// just a feature flag".
//
// What this achieves is that no deployed build answers: every handler returns
// 404 before reading its request, and every path any of them touches is under
// inference-corpus/. What it does not achieve is keeping the handlers out of a
// deployed bundle; that is recorded as a limitation in
// docs/2026-08-02-inference-ui-spec.md rather than solved here.

export const IS_DEV = process.env.NODE_ENV === 'development';

// Indistinguishable from a route that was never built, which is the point.
export const notFound = (): Response =>
  new Response('Not found', { status: 404 });

export const failed = (e: unknown): Response =>
  new Response(e instanceof Error ? e.message : String(e), { status: 400 });
