"use client";
// The chooser's library: built-ins + imported packs, reconciled against
// partial eviction on every load. All pack knowledge for the panel flows
// through here; the panel never touches the store directly.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMPANIONS,
  companionList,
  type Companion,
} from "@/lib/companions/companions";
import { PackError, type PackManifest } from "@/lib/goonpacks/manifest";
import { parsePack } from "@/lib/goonpacks/pack";
import {
  applyOverlay,
  packToCompanion,
  resolveDefault,
  type PackContent,
} from "@/lib/goonpacks/resolve";
import {
  deletePack,
  getPackZip,
  listStoredManifests,
  putPack,
  readIndex,
  reconcile,
  toIndexEntry,
  writeIndex,
  type IndexEntry,
} from "@/lib/goonpacks/store";

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
export type PendingImport = {
  manifest: PackManifest;
  replaces: IndexEntry | null;
  commit(): Promise<void>;
};

const LAST_PLAYED_PREFIX = "goonpacks:last-variant:"; // cosmetic marker

const publisher = (id: string) => id.split(".")[0]!;

// Library state assembled from whatever survived storage: manifests for live
// records, index entries standing in for evicted ones.
function buildEntries(
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
      companion: {
        ...packToCompanion({
          manifest: { format: 1, id: e.id, version: e.version, name: e.name },
          pictures: [],
        }),
      },
      builtIn: false,
      missing: true,
      variants: overlayFor(e.id),
    }));
  return [...builtIns, ...completes, ...evicted];
}

// Unzip a stored pack. Missing/unreadable → PackError (the card's re-import
// path); pictures become object URLs, revoked by the caller when replaced.
async function loadContent(packId: string): Promise<PackContent> {
  const zip = await getPackZip(packId);
  if (zip === null) throw new PackError("pack missing — re-import its zip");
  const parsed = parsePack(new Uint8Array(await zip.arrayBuffer()));
  return {
    manifest: parsed.manifest,
    systemPrompt: parsed.systemPrompt,
    pictures: parsed.pictures.map((p) => ({
      src: URL.createObjectURL(
        new Blob([p.bytes.buffer as ArrayBuffer], { type: p.mimeType }),
      ),
      description: p.description,
      // Stable thread reference: object URLs die with the session, so the
      // thread persists this ref and rendering resolves it (see spec Threads).
      ref: `goonpack:${packId}/${p.name}`,
    })),
  };
}

export function useGoonpackLibrary() {
  const [entries, setEntries] = useState<LibraryEntry[]>(() =>
    buildEntries([], []),
  );
  // Object URLs from the previous resolve — revoked when a new pick replaces
  // them (a session holds at most one variant's pictures).
  const urlsRef = useRef<string[]>([]);

  const refresh = useCallback(async () => {
    const manifests = await listStoredManifests();
    const { healed, missing } = reconcile(
      readIndex(localStorage),
      manifests.map(toIndexEntry),
    );
    writeIndex(localStorage, healed);
    setEntries(buildEntries(manifests, missing));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importPack = useCallback(
    async (file: File): Promise<PendingImport> => {
      const parsed = parsePack(new Uint8Array(await file.arrayBuffer()));
      const m = parsed.manifest;
      if (m.base !== undefined) {
        const baseExists =
          COMPANIONS[m.base] !== undefined ||
          readIndex(localStorage).some((e) => e.id === m.base);
        if (!baseExists) {
          throw new PackError(`needs its base installed first: ${m.base}`);
        }
      }
      const replaces =
        readIndex(localStorage).find((e) => e.id === m.id) ?? null;
      return {
        manifest: m,
        replaces,
        commit: async () => {
          await putPack(m, file);
          writeIndex(localStorage, [
            ...readIndex(localStorage).filter((e) => e.id !== m.id),
            toIndexEntry(m),
          ]);
          await refresh();
        },
      };
    },
    [refresh],
  );

  const removePack = useCallback(
    async (id: string) => {
      // User-initiated removal cascades to the pack's overlays (never on
      // eviction). Threads are untouched — re-import brings her back whole.
      const index = readIndex(localStorage);
      const doomed = [
        id,
        ...index.filter((e) => e.base === id).map((e) => e.id),
      ];
      for (const d of doomed) await deletePack(d);
      writeIndex(
        localStorage,
        index.filter((e) => !doomed.includes(e.id)),
      );
      await refresh();
    },
    [refresh],
  );

  const resolveVariant = useCallback(
    async (entry: LibraryEntry, packId: string | null): Promise<Companion> => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [];
      let companion: Companion;
      if (packId === null) {
        companion = entry.builtIn
          ? resolveDefault(entry.companion)
          : packToCompanion(await loadContent(entry.companion.id));
      } else {
        const base = entry.builtIn
          ? entry.companion
          : packToCompanion(await loadContent(entry.companion.id));
        companion = applyOverlay(base, await loadContent(packId));
      }
      urlsRef.current = (companion.pictures ?? []).map((p) => p.src);
      localStorage.setItem(
        LAST_PLAYED_PREFIX + entry.companion.id,
        packId ?? "default",
      );
      return companion;
    },
    [],
  );

  const lastPlayed = useCallback(
    (companionId: string) =>
      localStorage.getItem(LAST_PLAYED_PREFIX + companionId),
    [],
  );

  return { entries, lastPlayed, importPack, removePack, resolveVariant };
}
