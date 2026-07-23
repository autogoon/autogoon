// The Companion access gate: a shared "access ID" secret that unlocks the
// Companions feature for a demo, without standing up real auth. The ID travels
// from the browser to the paid API routes in the ACCESS_HEADER; the server
// checks it against the COMPANIONS_ACCESS_IDS list (see access-check.ts, the
// server-only half). This module is the client-safe half: the header/storage
// names, the localStorage read/write, and the pure list parser the server
// reuses. No secret and no server-only imports live here.

export const ACCESS_HEADER = "x-access-id";
export const ACCESS_STORAGE_KEY = "companions:access-id";

// Parse the comma-separated COMPANIONS_ACCESS_IDS env value into a clean list:
// split on commas, trim, drop blanks. An empty result means NOTHING validates —
// the gate is fail-closed (see checkAccessId in access-check.ts), so in
// builds/deploys an unset or empty env leaves Companions hidden and its routes
// rejecting everything (the dev server skips the gate on the paid routes).
export function parseAccessIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

// The saved access ID for this browser (empty string when unset/unavailable).
export function getAccessId(): string {
  try {
    return localStorage.getItem(ACCESS_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

// Persist (or clear, when empty) the access ID for this browser.
export function setAccessId(id: string): void {
  try {
    if (id === "") localStorage.removeItem(ACCESS_STORAGE_KEY);
    else localStorage.setItem(ACCESS_STORAGE_KEY, id);
  } catch {
    // ignore: storage full or unavailable
  }
}
