// Goonpack manifest: parsing + validation. Pure — no React, no browser APIs.
// The manifest is the identity/config half of a pack (see
// docs/superpowers/specs/2026-07-23-goonpacks-design.md for the format).

// Terse, user-facing import errors — every message here can surface in the UI.
// Validation collects everything wrong with a pack, not just the first hit:
// `problems` is the full list; `message` joins it for single-line contexts.
export class PackError extends Error {
  readonly problems: string[];
  constructor(problems: string | string[]) {
    const list = typeof problems === "string" ? [problems] : problems;
    super(list.join("; "));
    this.problems = list;
  }
}

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
  // What the pack adds or changes — about the PACK, not the companion
  // (`description` is hers).
  aboutThePack: string;
  name?: string; // complete packs only — an overlay keeps her name
  description?: string; // hers, for her card (overlay: replaces the base's while selected)
  gender?: "female" | "male" | "nonbinary"; // complete packs only, like name
  accentColour?: string;
  voiceId?: string; // ElevenLabs voice id (account-scoped, see spec)
  model?: string; // OpenRouter slug; app default when omitted
  contextWindow?: number;
  passesReasoning?: boolean;
  // Overlay only: the resolved variant has NO pictures, deliberately —
  // distinct from omitting pictures/, which keeps the base's set.
  noPictures?: boolean;
};

// Validate a decoded manifest.json. Completeness rules that depend on the rest
// of the zip (a complete pack needing system-prompt.md, name, voiceId) live in
// parsePack — this checks only the manifest's own fields. Field problems are
// collected and thrown together, so a bad manifest reports everything wrong
// with it at once; only a manifest we can't judge at all (not an object, a
// format this app doesn't know) fails alone.
export function parseManifest(raw: unknown): PackManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PackError("manifest.json doesn't contain a JSON object.");
  }
  const m = raw as Record<string, unknown>;
  // Format problems fail alone: without a format this app knows, the other
  // field rules may not apply, so any further "problems" could be junk.
  if (typeof m.format !== "number") {
    throw new PackError(
      'manifest.json is missing the format field — add "format": 1.',
    );
  }
  if (m.format > PACK_FORMAT) {
    throw new PackError("This pack needs a newer version of the app.");
  }
  if (m.format !== PACK_FORMAT) {
    throw new PackError(
      "This pack uses a format version this app doesn't recognise.",
    );
  }

  const problems: string[] = [];
  const optionalString = (v: unknown, field: string): string | undefined => {
    if (v === undefined) return undefined;
    if (typeof v !== "string") {
      problems.push(`The ${field} field must be text.`);
      return undefined;
    }
    return v;
  };
  if (m.id === undefined || m.id === "") {
    problems.push(
      "manifest.json is missing the id field — every pack needs an id like publisher.packname.",
    );
  } else if (typeof m.id !== "string" || !PACK_ID_RE.test(m.id)) {
    problems.push(
      "The id field must be publisher.packname — lowercase letters, numbers and hyphens only.",
    );
  }
  if (m.version === undefined || m.version === "") {
    problems.push(
      "manifest.json is missing the version field - this is the version number of your pack",
    );
  } else if (typeof m.version !== "string") {
    problems.push('The version field must be text in quotes, like "1.0.0".');
  }
  if (m.aboutThePack === undefined || m.aboutThePack === "") {
    problems.push(
      "manifest.json is missing the aboutThePack field — say what the pack adds or changes.",
    );
  } else if (typeof m.aboutThePack !== "string") {
    problems.push("The aboutThePack field must be text.");
  }
  if (m.base !== undefined) {
    if (typeof m.base !== "string" || !PACK_ID_RE.test(m.base)) {
      problems.push(
        "The base field must be the id of the companion this overlay changes, like autogoon.aimee.",
      );
    } else if (m.base === m.id) {
      // Structurally nonsensical, and it slips the library's install-state
      // checks (the "base" it finds is the pack it's replacing): committing
      // it would strand an overlay-of-itself no card or chip ever lists.
      problems.push(
        "A pack can't overlay itself — base must be a different companion's id.",
      );
    }
    // The id means the same her, and the thread stays hers — an overlay that
    // renames or re-genders her is a different companion: make a complete
    // pack instead.
    if (m.name !== undefined) {
      problems.push(
        "An overlay can't change a companion's name, remove the name field from manifest.json.",
      );
    }
    if (m.gender !== undefined) {
      problems.push(
        "An overlay can't change a companion's gender, remove the gender field from manifest.json.",
      );
    }
  }
  if (m.gender !== undefined && !GENDERS.has(m.gender as string)) {
    problems.push("The gender field must be female, male or nonbinary.");
  }
  if (m.noPictures !== undefined) {
    if (typeof m.noPictures !== "boolean") {
      problems.push("The noPictures field must be true or false (no quotes).");
    }
    if (m.base === undefined) {
      problems.push(
        "noPictures is only for overlay packs — remove it from manifest.json.",
      );
    }
  }
  const accentColour = optionalString(m.accentColour, "accentColour");
  if (accentColour !== undefined && !ACCENT_COLOURS.has(accentColour)) {
    problems.push(
      `Unknown accentColour: ${accentColour} — pick one of ${[...ACCENT_COLOURS].join(", ")}.`,
    );
  }
  if (m.contextWindow !== undefined && typeof m.contextWindow !== "number") {
    problems.push("The contextWindow field must be a number (no quotes).");
  }
  if (
    m.passesReasoning !== undefined &&
    typeof m.passesReasoning !== "boolean"
  ) {
    problems.push(
      "The passesReasoning field must be true or false (no quotes).",
    );
  }
  const name = optionalString(m.name, "name");
  const description = optionalString(m.description, "description");
  const voiceId = optionalString(m.voiceId, "voiceId");
  const model = optionalString(m.model, "model");
  if (problems.length > 0) throw new PackError(problems);
  // The casts are sound: reaching here means every pushed check passed.
  return {
    format: m.format,
    id: m.id as string,
    version: m.version as string,
    base: m.base as string | undefined,
    aboutThePack: m.aboutThePack as string,
    name,
    description,
    gender: m.gender as PackManifest["gender"],
    accentColour,
    voiceId,
    model,
    contextWindow: m.contextWindow as number | undefined,
    passesReasoning: m.passesReasoning as boolean | undefined,
    noPictures: m.noPictures as boolean | undefined,
  };
}
