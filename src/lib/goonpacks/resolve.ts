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
  type Companion,
  type CompanionPicture,
} from '@/lib/companions/companions';
import type { PackManifest } from './manifest';
import { fillSharedSections } from './prompt';

export type PackContent = {
  manifest: PackManifest;
  systemPrompt?: string;
  pictures: CompanionPicture[];
};

function fill(prompt: string, pictures: CompanionPicture[] | undefined) {
  return fillSharedSections(prompt, {
    includePictures: (pictures?.length ?? 0) > 0,
  });
}

// A built-in (or complete pack) played as-is — "default" in the variant list.
export function resolveDefault(base: Companion): Companion {
  return { ...base, systemPrompt: fill(base.systemPrompt, base.pictures) };
}

// Pack → Companion with the prompt left UNFILLED — for a pack used as an
// overlay's base, where applyOverlay does the (single) fill against the
// merged picture set. Filling here too would fill twice: the first pass
// drops {{PICTURES_SECTION}} for good when the base itself is pictureless,
// so an overlay bringing pictures could never restore it.
export function packToCompanionRaw(pack: PackContent): Companion {
  const m = pack.manifest;
  const c = m.companion;
  const pictures = pack.pictures.length > 0 ? pack.pictures : undefined;
  return {
    id: m.id,
    name: c.name ?? m.id,
    // Her card description, else the pack's about-text — better than an
    // empty card line.
    description: c.description ?? m.aboutThePack ?? '',
    gender: c.gender ?? 'female',
    accentColour: c.accentColour ?? 'pink',
    voiceId: c.voiceId ?? '',
    systemPrompt: pack.systemPrompt ?? '',
    model: c.model ?? DEFAULT_MODEL,
    contextWindow: c.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    passesReasoning: c.passesReasoning ?? DEFAULT_PASSES_REASONING,
    chattiness: c.chattiness ?? DEFAULT_CHATTINESS,
    playfulness: c.playfulness ?? DEFAULT_PLAYFULNESS,
    pictures,
  };
}

// A pack played directly (no overlay) — "default" in the variant list for an
// imported complete pack. Fills once, here.
export function packToCompanion(pack: PackContent): Companion {
  const raw = packToCompanionRaw(pack);
  return { ...raw, systemPrompt: fill(raw.systemPrompt, raw.pictures) };
}

// A thread's persisted picture ref → a renderable src, or null when the
// referenced pack picture isn't in the loaded set (render a placeholder —
// never a substitute picture). Pre-goonpacks threads stored raw paths; those
// never resolve either — the files they point at are gone.
export function resolvePictureRef(
  ref: string,
  pictures: CompanionPicture[] | undefined,
): string | null {
  return pictures?.find((p) => p.ref === ref)?.src ?? null;
}

export function applyOverlay(base: Companion, overlay: PackContent): Companion {
  const m = overlay.manifest;
  const c = m.companion;
  // noPictures strips the base's set outright; a pictures/ folder replaces
  // it; neither keeps it. name and gender are never the overlay's to change
  // (the manifest rejects them; the spread keeps the base's regardless).
  const pictures =
    m.noPictures === true
      ? undefined
      : overlay.pictures.length > 0
        ? overlay.pictures
        : base.pictures;
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
    pictures,
    systemPrompt: fill(rawPrompt, pictures),
  };
}
