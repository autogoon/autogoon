// Validation endpoint for the Companion access gate: the home page calls this
// with the candidate access ID in the header to decide whether to reveal
// Companions (immediate feedback), while the paid routes enforce the same
// checkAccess independently. Returns { gated, ok }: gated=false means the gate
// is off (home hides the access card entirely).
import { checkAccess } from "@/lib/companions/access-check";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const result = checkAccess(request);
  return Response.json(result, { status: result.ok ? 200 : 401 });
}
