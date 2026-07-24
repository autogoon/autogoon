// Library entries: reconciles built-ins with imported and evicted packs into
// what the chooser renders. Pure — no React, no storage I/O; the hook feeds
// this whatever it already read from IndexedDB/localStorage.
import { companionList, type Companion } from "@/lib/companions/companions";
import type { PackManifest } from "./manifest";
import { packToCompanion } from "./resolve";
import type { IndexEntry, PackSummary } from "./store";

// The overridable slots a variant can change — the chooser's feature line
// bolds exactly these.
export type VariantSlot = "pictures" | "prompt" | "voice" | "colour" | "model";

export type Variant = {
  packId: string | null; // null = default
  label: string;
  version?: string;
  missing: boolean;
  // What the card shows while this variant is selected (all undefined for a
  // missing variant — there's nothing readable to show):
  blurb?: string; // description override; card falls back to the base's
  accent?: string; // accentColour override
  pictures?: number; // effective picture count for this selection
  changed?: VariantSlot[]; // slots this overlay changes/adds — bolded
};
export type LibraryEntry = {
  companion: Companion;
  builtIn: boolean;
  missing: boolean;
  variants: Variant[];
};

export const publisher = (id: string) => id.split(".")[0]!;

type StoredPack = { manifest: PackManifest; summary?: PackSummary };

// Which slots an overlay changes, from its manifest + zip summary.
function changedSlots(p: StoredPack): VariantSlot[] {
  const out: VariantSlot[] = [];
  const s = p.summary;
  if ((s?.pictures ?? 0) > 0 || p.manifest.noPictures === true) {
    out.push("pictures");
  }
  if (s?.hasPrompt === true) out.push("prompt");
  if (p.manifest.voiceId !== undefined) out.push("voice");
  if (p.manifest.accentColour !== undefined) out.push("colour");
  if (p.manifest.model !== undefined) out.push("model");
  return out;
}

// The picture count a selection actually plays with: the overlay's own set
// when it brings one (or deliberately none), else the base's.
function effectivePictures(p: StoredPack, basePictures: number): number {
  if (p.manifest.noPictures === true) return 0;
  const own = p.summary?.pictures ?? 0;
  return own > 0 ? own : basePictures;
}

// Library state assembled from whatever survived storage: manifests (+ zip
// summaries) for live records, index entries standing in for evicted ones.
export function buildEntries(
  packs: StoredPack[],
  missing: IndexEntry[],
): LibraryEntry[] {
  const variantsFor = (
    companionId: string,
    basePictures: number,
  ): Variant[] => [
    {
      packId: null,
      label: "default",
      missing: false,
      pictures: basePictures,
      changed: [],
    },
    ...packs
      .filter((p) => p.manifest.base === companionId)
      .map((p) => ({
        packId: p.manifest.id,
        label: publisher(p.manifest.id),
        version: p.manifest.version,
        missing: false,
        blurb: p.manifest.description,
        accent: p.manifest.accentColour,
        pictures: effectivePictures(p, basePictures),
        changed: changedSlots(p),
      })),
    ...missing
      .filter((e) => e.base === companionId)
      .map((e) => ({
        packId: e.id,
        label: publisher(e.id),
        version: e.version,
        missing: true,
      })),
  ];
  const builtIns: LibraryEntry[] = companionList.map((c) => ({
    companion: c,
    builtIn: true,
    missing: false,
    variants: variantsFor(c.id, c.pictures?.length ?? 0),
  }));
  const completes: LibraryEntry[] = packs
    .filter((p) => p.manifest.base === undefined)
    .map((p) => ({
      companion: packToCompanion({ manifest: p.manifest, pictures: [] }),
      builtIn: false,
      missing: false,
      variants: variantsFor(p.manifest.id, p.summary?.pictures ?? 0),
    }));
  const evicted: LibraryEntry[] = missing
    .filter((e) => e.base === undefined)
    .map((e) => ({
      companion: packToCompanion({
        manifest: { format: 1, id: e.id, version: e.version, name: e.name },
        pictures: [],
      }),
      builtIn: false,
      missing: true,
      variants: variantsFor(e.id, 0),
    }));
  return [...builtIns, ...completes, ...evicted];
}
