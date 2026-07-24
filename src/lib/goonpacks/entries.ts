// Library entries: reconciles built-ins with imported and evicted packs into
// what the chooser renders. Pure — no React, no storage I/O; the hook feeds
// this whatever it already read from IndexedDB/localStorage.
import { companionList, type Companion } from "@/lib/companions/companions";
import type { PackManifest } from "./manifest";
import { packToCompanion } from "./resolve";
import type { IndexEntry } from "./store";

export type Variant = {
  packId: string | null;
  label: string;
  version?: string;
  missing: boolean;
};
export type LibraryEntry = {
  companion: Companion;
  builtIn: boolean;
  missing: boolean;
  variants: Variant[];
};

export const publisher = (id: string) => id.split(".")[0]!;

// Library state assembled from whatever survived storage: manifests for live
// records, index entries standing in for evicted ones.
export function buildEntries(
  manifests: PackManifest[],
  missing: IndexEntry[],
): LibraryEntry[] {
  const overlayFor = (companionId: string): Variant[] => [
    { packId: null, label: "default", missing: false },
    ...manifests
      .filter((m) => m.base === companionId)
      .map((m) => ({
        packId: m.id,
        label: publisher(m.id),
        version: m.version,
        missing: false,
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
    variants: overlayFor(c.id),
  }));
  const completes: LibraryEntry[] = manifests
    .filter((m) => m.base === undefined)
    .map((m) => ({
      companion: packToCompanion({ manifest: m, pictures: [] }),
      builtIn: false,
      missing: false,
      variants: overlayFor(m.id),
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
      variants: overlayFor(e.id),
    }));
  return [...builtIns, ...completes, ...evicted];
}
