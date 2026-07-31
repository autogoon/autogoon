// Turns pack content into a playable Companion. The load-time half of the
// prompt pipeline: shared-section tokens are filled here, live markers stay
// for the session's per-turn fill. An overlay keeps the BASE's id — the id is
// thread ownership, and an overlay is "my version of them", not a new
// companion.
import {
  DEFAULT_CHATTINESS,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL,
  DEFAULT_PASSES_REASONING,
  DEFAULT_PLAYFULNESS,
  DEFAULT_USES_REAL_TIME,
  DEFAULT_KNOWS_USER_TIME,
  type Companion,
  type CompanionMedia,
} from '@/lib/companions/companions';
import type { PackManifest } from './manifest';
import { fillSharedSections } from './prompt';

export type PackContent = {
  manifest: PackManifest;
  systemPrompt?: string;
  media: CompanionMedia[];
};

// The summary is what carries the media section, so it is what decides whether
// there is one. A pack with media always has one (parsePack refuses otherwise),
// so this is the same rule as "has media" with one input instead of two that
// could disagree.
function fill(prompt: string, mediaSummary: string | undefined) {
  return fillSharedSections(prompt, { mediaSummary });
}

// A built-in (or complete pack) played as-is — "default" in the variant list.
export function resolveDefault(base: Companion): Companion {
  return { ...base, systemPrompt: fill(base.systemPrompt, base.mediaSummary) };
}

// Pack → Companion with the prompt left UNFILLED — for a pack used as an
// overlay's base, where applyOverlay does the (single) fill against the
// merged media set. Filling here too would fill twice: the first pass
// spends {{MEDIA_SECTION}} on the base's own set — or, when the base is
// medialess, on the block saying there is nothing to send — and an overlay
// bringing media would then have no token left to fill.
export function packToCompanionRaw(pack: PackContent): Companion {
  const m = pack.manifest;
  const c = m.companion;
  const media = pack.media.length > 0 ? pack.media : undefined;
  return {
    id: m.id,
    name: c.name ?? m.id,
    // parsePack requires this on a complete pack, and a complete pack is all
    // packToCompanionRaw is ever given.
    description: c.description!,
    gender: c.gender ?? 'female',
    accentColour: c.accentColour ?? 'pink',
    voiceId: c.voiceId ?? '',
    systemPrompt: pack.systemPrompt ?? '',
    model: c.model ?? DEFAULT_MODEL,
    contextWindow: c.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    passesReasoning: c.passesReasoning ?? DEFAULT_PASSES_REASONING,
    chattiness: c.chattiness ?? DEFAULT_CHATTINESS,
    playfulness: c.playfulness ?? DEFAULT_PLAYFULNESS,
    timezone: c.timezone,
    usesRealTime: c.usesRealTime ?? DEFAULT_USES_REAL_TIME,
    knowsUserTime: c.knowsUserTime ?? DEFAULT_KNOWS_USER_TIME,
    media,
    // The summary describes this pack's own set, so it goes wherever that does.
    mediaSummary: media === undefined ? undefined : m.mediaSummary,
  };
}

// A pack played directly (no overlay) — "default" in the variant list for an
// imported complete pack. Fills once, here.
export function packToCompanion(pack: PackContent): Companion {
  const raw = packToCompanionRaw(pack);
  return { ...raw, systemPrompt: fill(raw.systemPrompt, raw.mediaSummary) };
}

// A thread's persisted media ref → the live entry, or null when the referenced
// item isn't in the loaded set (render a placeholder — never a substitute).
// Pre-goonpacks threads stored raw paths; those never resolve either — the
// files they point at are gone.
export function resolveMediaRef(
  ref: string,
  media: CompanionMedia[] | undefined,
): CompanionMedia | null {
  return media?.find((m) => m.ref === ref) ?? null;
}

export function applyOverlay(base: Companion, overlay: PackContent): Companion {
  const m = overlay.manifest;
  const c = m.companion;
  // noMedia strips the base's set outright; a media/ folder replaces it;
  // neither keeps it. name and gender are never the overlay's to change (the
  // manifest rejects them; the spread keeps the base's regardless).
  const overlayBringsMedia = overlay.media.length > 0;
  const media =
    m.noMedia === true
      ? undefined
      : overlayBringsMedia
        ? overlay.media
        : base.media;
  // The summary describes whichever set won, so it moves with it.
  const mediaSummary =
    m.noMedia === true
      ? undefined
      : overlayBringsMedia
        ? m.mediaSummary
        : base.mediaSummary;
  const rawPrompt = overlay.systemPrompt ?? base.systemPrompt;
  return {
    ...base, // id stays the base's — thread ownership; so do name and gender
    description: c.description ?? base.description,
    accentColour: c.accentColour ?? base.accentColour,
    voiceId: c.voiceId ?? base.voiceId,
    model: c.model ?? base.model,
    contextWindow: c.contextWindow ?? base.contextWindow,
    passesReasoning: c.passesReasoning ?? base.passesReasoning,
    chattiness: c.chattiness ?? base.chattiness,
    playfulness: c.playfulness ?? base.playfulness,
    timezone: c.timezone ?? base.timezone,
    usesRealTime: c.usesRealTime ?? base.usesRealTime,
    knowsUserTime: c.knowsUserTime ?? base.knowsUserTime,
    media,
    mediaSummary,
    systemPrompt: fill(rawPrompt, mediaSummary),
  };
}
