// Validation endpoint for the Companion access gate: the app calls this with the
// candidate access ID in the header to decide whether to reveal Companions
// (immediate feedback), while the paid routes enforce checkAccess independently.
// Deliberately the STRICT check (checkAccessId, not checkAccess): even on the
// dev server — where the paid routes are open — this validates real ids only,
// so the Settings access box remains a genuine test of the gate. Dev's
// always-visible home card comes from page.tsx, not from here.
import { checkAccessId } from "@/lib/companions/access-check";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const ok = checkAccessId(request);
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}
