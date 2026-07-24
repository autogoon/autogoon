// Library entries: built-ins merged with the VALID imported packs into what
// the chooser renders. Pure — no React, no storage I/O; the hook feeds this
// the packs that survived the load-time re-validation (incompatible packs
// never reach here — they list only on the Goonpacks screen).
import { companionList, type Companion } from "@/lib/companions/companions";
import type { PackManifest } from "./manifest";
import { packToCompanion } from "./resolve";

// Zip-level facts the manifest can't tell, derived at load/import from the
// parsed pack (pictures count, prompt presence).
export type PackSummary = { pictures: number; hasPrompt: boolean };

// A pack that passed the full load-time validation.
export type LoadedPack = { manifest: PackManifest; summary: PackSummary };

// The overridable slots a variant can change — the chooser's feature line
// bolds exactly these.
export type VariantSlot = "pictures" | "prompt" | "voice" | "colour" | "model";

export type Variant = {
  packId: string | null; // null = default
  label: string;
  version?: string;
  // What the card shows while this variant is selected:
  description?: string; // override; the card falls back to the base's
  accent?: string; // accentColour override
  pictures: number; // effective picture count for this selection
  changed: VariantSlot[]; // slots this overlay changes/adds — bolded
};
export type LibraryEntry = {
  companion: Companion;
  builtIn: boolean;
  variants: Variant[];
};

export const publisher = (id: string) => id.split(".")[0]!;

// Which slots an overlay changes, from its manifest + zip summary.
function changedSlots(p: LoadedPack): VariantSlot[] {
  const out: VariantSlot[] = [];
  if (p.summary.pictures > 0 || p.manifest.noPictures === true) {
    out.push("pictures");
  }
  if (p.summary.hasPrompt) out.push("prompt");
  if (p.manifest.voiceId !== undefined) out.push("voice");
  if (p.manifest.accentColour !== undefined) out.push("colour");
  if (p.manifest.model !== undefined) out.push("model");
  return out;
}

// The picture count a selection actually plays with: the overlay's own set
// when it brings one (or deliberately none), else the base's.
function effectivePictures(p: LoadedPack, basePictures: number): number {
  if (p.manifest.noPictures === true) return 0;
  return p.summary.pictures > 0 ? p.summary.pictures : basePictures;
}

export function buildEntries(packs: LoadedPack[]): LibraryEntry[] {
  const variantsFor = (
    companionId: string,
    basePictures: number,
  ): Variant[] => [
    {
      packId: null,
      label: "default",
      pictures: basePictures,
      changed: [],
    },
    ...packs
      .filter((p) => p.manifest.base === companionId)
      .map((p) => ({
        packId: p.manifest.id,
        label: publisher(p.manifest.id),
        version: p.manifest.version,
        description: p.manifest.description,
        accent: p.manifest.accentColour,
        pictures: effectivePictures(p, basePictures),
        changed: changedSlots(p),
      })),
  ];
  const builtIns: LibraryEntry[] = companionList.map((c) => ({
    companion: c,
    builtIn: true,
    variants: variantsFor(c.id, c.pictures?.length ?? 0),
  }));
  const completes: LibraryEntry[] = packs
    .filter((p) => p.manifest.base === undefined)
    .map((p) => ({
      companion: packToCompanion({ manifest: p.manifest, pictures: [] }),
      builtIn: false,
      variants: variantsFor(p.manifest.id, p.summary.pictures),
    }));
  return [...builtIns, ...completes];
}
