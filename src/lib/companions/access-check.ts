// Server-only half of the Companion access gate. Reads COMPANIONS_ACCESS_IDS,
// and decides whether a request may reach the paid Companions routes. Kept
// apart from access.ts because it pulls in node:crypto and process.env — this
// module must never be imported into the client bundle.
import { createHash, timingSafeEqual } from "node:crypto";
import { ACCESS_HEADER, parseAccessIds } from "./access";

// Fixed-length SHA-256 digest, so timingSafeEqual can compare candidates of any
// length (it throws on length mismatch) without leaking key length.
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
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

// gated=false means the gate is off (no ids configured): dev, tests and CI run
// unauthenticated exactly as before. When gated, the request's ACCESS_HEADER
// must match a configured id for ok to be true.
export type AccessResult = { gated: boolean; ok: boolean };

export function checkAccess(request: Request): AccessResult {
  const ids = parseAccessIds(process.env.COMPANIONS_ACCESS_IDS);
  if (ids.length === 0) return { gated: false, ok: true };
  const candidate = request.headers.get(ACCESS_HEADER) ?? "";
  return { gated: true, ok: candidate !== "" && matchesAny(ids, candidate) };
}
