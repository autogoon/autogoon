// Goonpack manifest: parsing + validation. Pure — no React, no browser APIs.
// The manifest is the identity/config half of a pack (see
// docs/superpowers/specs/2026-07-23-goonpacks-design.md for the format).

// Terse, user-facing import errors — every message here can surface in the UI.
// Validation collects everything wrong with a pack, not just the first hit:
// `problems` is the full list; `message` joins it for single-line contexts.
export class PackError extends Error {
  readonly problems: string[];
  constructor(problems: string | string[]) {
    const list = typeof problems === 'string' ? [problems] : problems;
    super(list.join('; '));
    // Only an Error's name and message survive the trip out of a worker, so
    // the name is what tells the importer this failure was already phrased for
    // the user rather than being a raw exception to interpret.
    this.name = 'PackError';
    this.problems = list;
  }
}

// publisher.name — both halves strict slugs, single dot. Ids end up in storage
// keys and thread keys, so the charset is locked down at the format level.
export const PACK_ID_RE = /^[a-z0-9-]+\.[a-z0-9-]+$/;

// The accent hues safelisted in globals.css — a pack colour outside this set
// would silently render unstyled, so reject it at import instead.
const ACCENT_COLOURS = new Set([
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
]);

const GENDERS = new Set(['female', 'male', 'nonbinary']);

// The pack-format version this app understands. Bump only with a format change.
export const PACK_FORMAT = 2;

// Formats 1 and 2 differ only in the media folder's name and noPictures, so
// this is what "written for the old format" concretely means.
export const OLD_LAYOUT_PROBLEM =
  'This pack uses the old pictures/ layout — rebuild it with a media/ folder and "format": 2.';

// Every field the manifest's top level allows.
const TOP_FIELDS = new Set([
  'format',
  'id',
  'version',
  'base',
  'aboutThePack',
  'noMedia',
  'companion',
]);

// The companion half of the manifest — everything under the `companion` key.
// The top level is about the pack; this is about the companion it makes or
// changes.
export type CompanionConfig = {
  name?: string; // complete packs only — an overlay keeps the base's name
  description?: string; // the companion's, for their card (overlay: replaces the base's while selected)
  gender?: 'female' | 'male' | 'nonbinary'; // complete packs only, like name
  accentColour?: string;
  voiceId?: string; // ElevenLabs voice id (account-scoped, see spec)
  model?: string; // OpenRouter slug; app default when omitted
  contextWindow?: number;
  passesReasoning?: boolean;
  chattiness?: number; // 1–5: how readily a silence is filled out of play
  playfulness?: number; // 1–5: how readily they talk over a running program
};

// The keys of CompanionConfig — the only fields the companion section allows.
const COMPANION_FIELDS = [
  'name',
  'description',
  'gender',
  'accentColour',
  'voiceId',
  'model',
  'contextWindow',
  'passesReasoning',
  'chattiness',
  'playfulness',
] as const;

export type PackManifest = {
  format: number; // pack-format version (not the pack's own version)
  id: string; // publisher.name — unversioned identity
  version: string; // author's own version; displayed as-is, never interpreted
  base?: string; // overlay only: id of the companion it modifies
  // What the pack adds or changes — about the PACK, not the companion
  // (that's `companion.description`).
  aboutThePack: string;
  // Overlay only: the resolved variant has NO media, deliberately — distinct
  // from omitting media/, which keeps the base's set.
  noMedia?: boolean;
  // Always present after parsing — {} when the manifest carries none.
  companion: CompanionConfig;
};

// Validate a decoded manifest.json. Completeness rules that depend on the rest
// of the pack's tree (a complete pack needing system-prompt.md, name, voiceId)
// live in parsePack — this checks only the manifest's own fields. Field
// problems are collected and thrown together, so a bad manifest reports
// everything wrong
// with it at once; only a manifest we can't judge at all (not an object, a
// format this app doesn't know) fails alone.
export function parseManifest(raw: unknown): PackManifest {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PackError("manifest.json doesn't contain a JSON object.");
  }
  const m = raw as Record<string, unknown>;
  // Format problems fail alone: without a format this app knows, the other
  // field rules may not apply, so any further "problems" could be junk.
  if (typeof m.format !== 'number') {
    throw new PackError(
      'manifest.json is missing the format field — add "format": 2.',
    );
  }
  if (m.format > PACK_FORMAT) {
    throw new PackError('This pack needs a newer version of the app.');
  }
  if (m.format !== PACK_FORMAT && m.format !== 1) {
    throw new PackError(
      "This pack uses a format version this app doesn't recognise.",
    );
  }
  // A format 1 pack that used noPictures is genuinely written to the old
  // format; one that didn't may still be a format 2 pack in every respect,
  // which only the tree can say — parsePack finishes the judgement.
  if (m.format === 1 && m.noPictures !== undefined) {
    throw new PackError(OLD_LAYOUT_PROBLEM);
  }

  const problems: string[] = [];
  const optionalString = (v: unknown, field: string): string | undefined => {
    if (v === undefined) return undefined;
    if (typeof v !== 'string') {
      problems.push(`The ${field} field must be text.`);
      return undefined;
    }
    return v;
  };
  if (m.id === undefined || m.id === '') {
    problems.push(
      'manifest.json is missing the id field — every pack needs an id like publisher.packname.',
    );
  } else if (typeof m.id !== 'string' || !PACK_ID_RE.test(m.id)) {
    problems.push(
      'The id field must be publisher.packname — lowercase letters, numbers and hyphens only.',
    );
  }
  if (m.version === undefined || m.version === '') {
    problems.push(
      'manifest.json is missing the version field - this is the version number of your pack',
    );
  } else if (typeof m.version !== 'string') {
    problems.push('The version field must be text in quotes, like "1.0.0".');
  }
  if (m.aboutThePack === undefined || m.aboutThePack === '') {
    problems.push(
      'manifest.json is missing the aboutThePack field — say what the pack adds or changes.',
    );
  } else if (typeof m.aboutThePack !== 'string') {
    problems.push('The aboutThePack field must be text.');
  }
  if (m.base !== undefined) {
    if (typeof m.base !== 'string' || !PACK_ID_RE.test(m.base)) {
      problems.push(
        'The base field must be the id of the companion this overlay changes, like autogoon.aimee.',
      );
    } else if (m.base === m.id) {
      // Structurally nonsensical, and it slips the library's install-state
      // checks (the "base" it finds is the pack it's replacing): committing
      // it would strand an overlay-of-itself no card or chip ever lists.
      problems.push(
        "A pack can't overlay itself — base must be a different companion's id.",
      );
    }
  }
  if (m.noMedia !== undefined) {
    if (typeof m.noMedia !== 'boolean') {
      problems.push('The noMedia field must be true or false (no quotes).');
    }
    if (m.base === undefined) {
      problems.push(
        'noMedia is only for overlay packs — remove it from manifest.json.',
      );
    }
  }
  // Only known fields, in their right place — an unknown name is usually a
  // typo (accentColor, voiceID) that would otherwise be silently ignored.
  for (const f of Object.keys(m)) {
    if (!TOP_FIELDS.has(f)) {
      problems.push(`Unknown field at the top level of manifest.json: ${f}.`);
    }
  }
  let c: Record<string, unknown> = {};
  if (m.companion !== undefined) {
    if (
      typeof m.companion !== 'object' ||
      m.companion === null ||
      Array.isArray(m.companion)
    ) {
      problems.push(
        'The companion field must be a section in braces — companion: { … } with the companion fields inside.',
      );
    } else {
      c = m.companion as Record<string, unknown>;
    }
  }
  for (const f of Object.keys(c)) {
    if (!(COMPANION_FIELDS as readonly string[]).includes(f)) {
      problems.push(`Unknown field in the companion section: ${f}.`);
    }
  }
  if (m.base !== undefined) {
    // The id means the same companion, and the thread stays theirs — an
    // overlay that renames or re-genders them is a different companion: make
    // a complete pack instead.
    if (c.name !== undefined) {
      problems.push(
        "An overlay can't change a companion's name, remove the name field from the companion section.",
      );
    }
    if (c.gender !== undefined) {
      problems.push(
        "An overlay can't change a companion's gender, remove the gender field from the companion section.",
      );
    }
  }
  if (c.gender !== undefined && !GENDERS.has(c.gender as string)) {
    problems.push('The gender field must be female, male or nonbinary.');
  }
  const accentColour = optionalString(c.accentColour, 'accentColour');
  if (accentColour !== undefined && !ACCENT_COLOURS.has(accentColour)) {
    problems.push(
      `Unknown accentColour: ${accentColour} — pick one of ${[...ACCENT_COLOURS].join(', ')}.`,
    );
  }
  if (c.contextWindow !== undefined && typeof c.contextWindow !== 'number') {
    problems.push('The contextWindow field must be a number (no quotes).');
  }
  if (
    c.passesReasoning !== undefined &&
    typeof c.passesReasoning !== 'boolean'
  ) {
    problems.push(
      'The passesReasoning field must be true or false (no quotes).',
    );
  }
  // 1–5 on both, so a pack that means "barely speaks" can't quietly ask for a
  // poke every few milliseconds. Out-of-range is rejected rather than clamped:
  // a number outside the scale is a misunderstanding of what it means, and the
  // author would rather be told than have it silently reinterpreted.
  for (const trait of ['chattiness', 'playfulness'] as const) {
    const v = c[trait];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
      problems.push(`The ${trait} field must be a whole number from 1 to 5.`);
    }
  }
  const name = optionalString(c.name, 'name');
  const description = optionalString(c.description, 'description');
  const voiceId = optionalString(c.voiceId, 'voiceId');
  const model = optionalString(c.model, 'model');
  if (problems.length > 0) throw new PackError(problems);
  // The casts are sound: reaching here means every pushed check passed.
  return {
    format: m.format,
    id: m.id as string,
    version: m.version as string,
    base: m.base as string | undefined,
    aboutThePack: m.aboutThePack as string,
    noMedia: m.noMedia as boolean | undefined,
    companion: {
      name,
      description,
      gender: c.gender as CompanionConfig['gender'],
      accentColour,
      voiceId,
      model,
      contextWindow: c.contextWindow as number | undefined,
      passesReasoning: c.passesReasoning as boolean | undefined,
      chattiness: c.chattiness as number | undefined,
      playfulness: c.playfulness as number | undefined,
    },
  };
}
