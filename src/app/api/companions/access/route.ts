// Validation endpoint for the Companion access gate: the app calls this with the
// candidate access ID in the header to decide whether to reveal Companions
// (immediate feedback), while the paid routes enforce the same checkAccess
// independently. Returns { ok }: true only when a valid id is supplied — with
// nothing configured it is always false (fail closed), so Companions stays
// hidden and locked.
import { checkAccess } from "@/lib/companions/access-check";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const ok = checkAccess(request);
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}
