// Goonpack manifest: parsing + validation. Pure — no React, no browser APIs.
// The manifest is the identity/config half of a pack (see
// docs/superpowers/specs/2026-07-23-goonpacks-design.md for the format).

// Terse, user-facing import errors — every message here can surface in the UI.
export class PackError extends Error {}

// publisher.name — both halves strict slugs, single dot. Ids end up in storage
// keys and thread keys, so the charset is locked down at the format level.
export const PACK_ID_RE = /^[a-z0-9-]+\.[a-z0-9-]+$/;

// The accent hues safelisted in globals.css — a pack colour outside this set
// would silently render unstyled, so reject it at import instead.
const ACCENT_COLOURS = new Set([
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
]);

const GENDERS = new Set(["female", "male", "nonbinary"]);

// The pack-format version this app understands. Bump only with a format change.
export const PACK_FORMAT = 1;

export type PackManifest = {
  format: number; // pack-format version (not the pack's own version)
  id: string; // publisher.name — unversioned identity
  version: string; // author's own version; displayed as-is, never interpreted
  base?: string; // overlay only: id of the companion it modifies
  name?: string;
  description?: string;
  gender?: "female" | "male" | "nonbinary";
  accentColour?: string;
  voiceId?: string; // ElevenLabs voice id (account-scoped, see spec)
  model?: string; // OpenRouter slug; app default when omitted
  contextWindow?: number;
  passesReasoning?: boolean;
};

function optionalString(v: unknown, field: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new PackError(`${field} must be text`);
  return v;
}

// Validate a decoded manifest.json. Completeness rules that depend on the rest
// of the zip (a complete pack needing system-prompt.md, name, voiceId) live in
// parsePack — this checks only the manifest's own fields.
export function parseManifest(raw: unknown): PackManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PackError("manifest.json is not an object");
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.format !== "number") throw new PackError("missing format");
  if (m.format > PACK_FORMAT) {
    throw new PackError("This pack needs a newer version of the app.");
  }
  if (m.format !== PACK_FORMAT) throw new PackError("unknown format");
  if (typeof m.id !== "string" || !PACK_ID_RE.test(m.id)) {
    throw new PackError("id must be publisher.name (lowercase slugs)");
  }
  if (typeof m.version !== "string" || m.version === "") {
    throw new PackError("missing version");
  }
  if (m.base !== undefined) {
    if (typeof m.base !== "string" || !PACK_ID_RE.test(m.base)) {
      throw new PackError("base must be a companion id (publisher.name)");
    }
    // Structurally nonsensical, and it slips the library's install-state
    // checks (the "base" it finds is the pack it's replacing): committing it
    // would strand an overlay-of-itself no card or chip ever lists.
    if (m.base === m.id) {
      throw new PackError("a pack can't overlay itself");
    }
  }
  if (m.gender !== undefined && !GENDERS.has(m.gender as string)) {
    throw new PackError("unknown gender");
  }
  const accentColour = optionalString(m.accentColour, "accentColour");
  if (accentColour !== undefined && !ACCENT_COLOURS.has(accentColour)) {
    throw new PackError(`unknown accentColour: ${accentColour}`);
  }
  if (m.contextWindow !== undefined && typeof m.contextWindow !== "number") {
    throw new PackError("contextWindow must be a number");
  }
  if (
    m.passesReasoning !== undefined &&
    typeof m.passesReasoning !== "boolean"
  ) {
    throw new PackError("passesReasoning must be true or false");
  }
  return {
    format: m.format,
    id: m.id,
    version: m.version,
    base: m.base as string | undefined,
    name: optionalString(m.name, "name"),
    description: optionalString(m.description, "description"),
    gender: m.gender as PackManifest["gender"],
    accentColour,
    voiceId: optionalString(m.voiceId, "voiceId"),
    model: optionalString(m.model, "model"),
    contextWindow: m.contextWindow as number | undefined,
    passesReasoning: m.passesReasoning as boolean | undefined,
  };
}
