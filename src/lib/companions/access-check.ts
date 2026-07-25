// Server-only half of the Companion access gate. Reads COMPANIONS_ACCESS_IDS,
// and decides whether a request may reach the paid Companions routes. Kept
// apart from access.ts because it pulls in node:crypto and process.env — this
// module must never be imported into the client bundle.
import { createHash, timingSafeEqual } from 'node:crypto';
import { ACCESS_HEADER, parseAccessIds } from './access';

// Fixed-length SHA-256 digest, so timingSafeEqual can compare candidates of any
// length (it throws on length mismatch) without leaking key length.
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

// Constant-time membership: is `candidate` one of the configured ids? Every id
// is compared (no early return) so timing doesn't reveal which — or how many.
function matchesAny(ids: string[], candidate: string): boolean {
  const c = digest(candidate);
  let ok = false;
  for (const id of ids) {
    if (timingSafeEqual(digest(id), c)) ok = true;
  }
  return ok;
}

// The real check, fail closed. Access requires BOTH a configured id list AND a
// request header matching one of the ids. With nothing configured (empty/unset
// env) NOTHING validates — an unconfigured or misconfigured deploy must never
// expose the paid routes. The validation endpoint uses this directly, so the
// Settings access box exercises the genuine gate even on the dev server.
export function checkAccessId(request: Request): boolean {
  const ids = parseAccessIds(process.env.COMPANIONS_ACCESS_IDS);
  if (ids.length === 0) return false;
  const candidate = request.headers.get(ACCESS_HEADER) ?? '';
  return candidate !== '' && matchesAny(ids, candidate);
}

// What the paid routes enforce: the real check — except on the dev server
// (`npm run dev`, NODE_ENV=development), where the gate is open so Companions
// works with no id (your machine, your keys). Builds (`next build`/`start`,
// every deploy) are never "development", so this can't leak into production.
// Note the dev server binds 0.0.0.0, so dev also opens the paid routes to your
// LAN while it runs.
export function checkAccess(request: Request): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return checkAccessId(request);
}
