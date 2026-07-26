// Library entries: built-ins merged with the VALID imported packs into what
// the chooser renders. Pure — no React, no storage I/O; the hook feeds this
// the packs that survived the load-time re-validation (incompatible packs
// never reach here — they list only on the Goonpacks screen).
//
// Versions coexist: every id+version is its own stored pack, so an entry
// carries two option lists — base versions and overlay versions — matching
// the card's two selects. Newest first in both, by alphanumeric version sort.
import { companionList, type Companion } from '@/lib/companions/companions';
import type { PackManifest } from './manifest';
import type { MediaKind } from './media';
import { packToCompanion } from './resolve';

// What a pack's tree holds that the manifest can't say — the media it carries,
// split by kind (the chooser and the admin row name stills and videos
// separately), and whether it has a prompt.
export type MediaCount = { images: number; videos: number };
export type PackSummary = { media: MediaCount; hasPrompt: boolean };

export const totalMedia = (c: MediaCount): number => c.images + c.videos;

// The one tally of a media list, wherever the list comes from: a parsed tree,
// a built-in companion's own media, or the authoring build script's pack.
export const countMedia = (
  media: readonly { kind: MediaKind }[],
): MediaCount => ({
  images: media.filter((m) => m.kind === 'image').length,
  videos: media.filter((m) => m.kind === 'video').length,
});

// "3 pictures · 2 videos" — one phrase, used by both the chooser card's
// feature line and the Goonpacks row, so a pack reads the same on either
// screen.
export function describeMedia(c: MediaCount): string {
  const parts: string[] = [];
  if (c.images > 0) {
    parts.push(`${c.images} picture${c.images === 1 ? '' : 's'}`);
  }
  if (c.videos > 0) {
    parts.push(`${c.videos} video${c.videos === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

// A pack that passed the full load-time validation.
export type LoadedPack = { manifest: PackManifest; summary: PackSummary };

// Storage key: versions coexist, so a stored pack is identified by
// id@version ("@" can't appear in an id, so the split is unambiguous).
export const packKey = (m: { id: string; version: string }): string =>
  `${m.id}@${m.version}`;
export const keyId = (key: string): string => key.split('@')[0]!;
export const keyVersion = (key: string): string =>
  key.slice(key.indexOf('@') + 1);

// Newest first. Versions are free text the app never interprets — beyond
// this alphanumeric sort ("1.10" after "1.9", digits compared as numbers).
export const newestFirst = (a: string, b: string): number =>
  b.localeCompare(a, undefined, { numeric: true });

// The overridable slots a variant can change — the chooser's feature line
// bolds exactly these.
export type VariantSlot = 'media' | 'prompt' | 'voice' | 'colour' | 'model';

// One selectable pack version — an option in the card's base or overlay
// select. key null = the built-in itself (the base select's only option on
// a built-in card).
export type PackOption = {
  key: string | null;
  label: string; // publisher half of the id ("default" for a built-in)
  version?: string;
  // What the card shows while this option is selected:
  description?: string; // override; the card falls back down the chain
  accent?: string; // accentColour override
  media: MediaCount; // media this option itself brings
  noMedia?: boolean; // overlay deliberately plays medialess
  changed: VariantSlot[]; // overlay only: slots it changes/adds — bolded
};
export type LibraryEntry = {
  companion: Companion;
  builtIn: boolean;
  bases: PackOption[]; // newest first; a built-in has one key-null option
  overlays: PackOption[]; // newest first per overlay; none = no select
};

export const publisher = (id: string) => id.split('.')[0]!;

// Which slots an overlay changes, from its manifest + tree summary.
function changedSlots(p: LoadedPack): VariantSlot[] {
  const out: VariantSlot[] = [];
  if (totalMedia(p.summary.media) > 0 || p.manifest.noMedia === true) {
    out.push('media');
  }
  if (p.summary.hasPrompt) out.push('prompt');
  if (p.manifest.companion.voiceId !== undefined) out.push('voice');
  if (p.manifest.companion.accentColour !== undefined) out.push('colour');
  if (p.manifest.companion.model !== undefined) out.push('model');
  return out;
}

// The media a base+overlay selection actually plays with: the overlay's own set
// when it brings one (or deliberately none), else the base's.
export function effectiveMedia(
  overlay: PackOption | null,
  base: MediaCount,
): MediaCount {
  if (overlay === null) return base;
  if (overlay.noMedia === true) return { images: 0, videos: 0 };
  return totalMedia(overlay.media) > 0 ? overlay.media : base;
}

const baseOption = (p: LoadedPack): PackOption => ({
  key: packKey(p.manifest),
  label: publisher(p.manifest.id),
  version: p.manifest.version,
  description: p.manifest.companion.description,
  accent: p.manifest.companion.accentColour,
  media: p.summary.media,
  changed: [],
});

const overlayOption = (p: LoadedPack): PackOption => ({
  key: packKey(p.manifest),
  label: publisher(p.manifest.id),
  version: p.manifest.version,
  description: p.manifest.companion.description,
  accent: p.manifest.companion.accentColour,
  media: p.summary.media,
  noMedia: p.manifest.noMedia,
  changed: changedSlots(p),
});

// Newest first, grouped: same-id versions stay together (ids alphabetical),
// versions newest first within the group.
const byIdThenVersion = (a: LoadedPack, b: LoadedPack): number =>
  a.manifest.id.localeCompare(b.manifest.id) ||
  newestFirst(a.manifest.version, b.manifest.version);

export function buildEntries(packs: LoadedPack[]): LibraryEntry[] {
  const overlaysFor = (companionId: string): PackOption[] =>
    packs
      .filter((p) => p.manifest.base === companionId)
      .sort(byIdThenVersion)
      .map(overlayOption);
  const builtIns: LibraryEntry[] = companionList.map((c) => ({
    companion: c,
    builtIn: true,
    bases: [
      {
        key: null,
        label: 'default',
        media: countMedia(c.media ?? []),
        changed: [],
      },
    ],
    overlays: overlaysFor(c.id),
  }));
  // Complete packs: one entry per companion id — the same companion across
  // versions (same thread) — with each version a base option, newest first.
  const completes: LibraryEntry[] = [];
  const seen = new Set<string>();
  for (const p of packs) {
    if (p.manifest.base !== undefined || seen.has(p.manifest.id)) continue;
    seen.add(p.manifest.id);
    const versions = packs
      .filter(
        (q) => q.manifest.base === undefined && q.manifest.id === p.manifest.id,
      )
      .sort(byIdThenVersion);
    const newest = versions[0]!;
    completes.push({
      // The card's identity (name, fallbacks) comes from the newest version;
      // the selects override per pick.
      companion: packToCompanion({ manifest: newest.manifest, media: [] }),
      builtIn: false,
      bases: versions.map(baseOption),
      overlays: overlaysFor(p.manifest.id),
    });
  }
  return [...builtIns, ...completes];
}
