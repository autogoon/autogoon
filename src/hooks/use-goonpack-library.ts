"use client";
// The chooser's library: built-ins + imported packs, reconciled against
// partial eviction on every load. All pack knowledge for the panel flows
// through here; the panel never touches the store directly.
import { useCallback, useEffect, useRef, useState } from "react";
import { COMPANIONS, type Companion } from "@/lib/companions/companions";
import {
  buildEntries,
  type LibraryEntry,
  type Variant,
} from "@/lib/goonpacks/entries";
import { PackError, type PackManifest } from "@/lib/goonpacks/manifest";
import { parsePack } from "@/lib/goonpacks/pack";
import {
  applyOverlay,
  packToCompanion,
  packToCompanionRaw,
  resolveDefault,
  type PackContent,
} from "@/lib/goonpacks/resolve";
import {
  deletePack,
  getPackBytes,
  listStoredPacks,
  putPack,
  readIndex,
  reconcile,
  toIndexEntry,
  writeIndex,
  type IndexEntry,
  type PackSummary,
} from "@/lib/goonpacks/store";

export type { LibraryEntry, Variant };
export type PendingImport = {
  manifest: PackManifest;
  replaces: IndexEntry | null;
  commit(): Promise<void>;
};

const LAST_PLAYED_PREFIX = "goonpacks:last-variant:"; // cosmetic marker

// An overlay's base must be installed (built-in or a live/evicted-but-known
// pack) and must itself be a companion, not another overlay — chaining
// overlays isn't a supported shape (spec: "base = built-in or complete pack
// only"). Shared between import-time and commit-time validation (item 7:
// installed at import can go missing again by the time Import is clicked).
function overlayBaseError(base: string): PackError | null {
  const index = readIndex(localStorage);
  const baseEntry = index.find((e) => e.id === base);
  const baseIsBuiltIn = COMPANIONS[base] !== undefined;
  if (!baseIsBuiltIn && baseEntry === undefined) {
    return new PackError(`needs its base installed first: ${base}`);
  }
  if (baseEntry?.base !== undefined) {
    return new PackError("base must be a companion, not an overlay");
  }
  return null;
}

// Unzip a stored pack. Missing/unreadable → PackError (the card's re-import
// path); pictures become object URLs, revoked by the caller when replaced.
// `collect`, when given, gets every object URL created — resolveVariant uses
// it to account for and revoke the losing side of a base/overlay picture pick
// (see resolveVariant).
async function loadContent(
  packId: string,
  collect?: string[],
): Promise<PackContent> {
  const zip = await getPackBytes(packId);
  if (zip === null) throw new PackError("pack missing — re-import its zip");
  const parsed = parsePack(new Uint8Array(zip));
  return {
    manifest: parsed.manifest,
    systemPrompt: parsed.systemPrompt,
    pictures: parsed.pictures.map((p) => {
      const src = URL.createObjectURL(
        new Blob([p.bytes.buffer as ArrayBuffer], { type: p.mimeType }),
      );
      collect?.push(src);
      return {
        src,
        description: p.description,
        // Stable thread reference: object URLs die with the session, so the
        // thread persists this ref and rendering resolves it (see spec Threads).
        ref: `goonpack:${packId}/${p.name}`,
      };
    }),
  };
}

// One row of the Goonpacks admin list: a live pack (manifest + zip-level
// summary) or an evicted one (index entry only — awaiting re-import).
export type PackRow = {
  id: string;
  version: string;
  name?: string;
  base?: string;
  missing: boolean;
  manifest?: PackManifest;
  summary?: PackSummary;
};

export function useGoonpackLibrary() {
  const [entries, setEntries] = useState<LibraryEntry[]>(() =>
    buildEntries([], []),
  );
  const [packs, setPacks] = useState<PackRow[]>([]);
  // Object URLs of the currently-committed pick — the only ones that should
  // ever be alive between resolveVariant calls.
  const urlsRef = useRef<string[]>([]);
  // Monotonic pick counter: only the newest resolveVariant commits its URLs.
  const resolveSeqRef = useRef(0);
  // Refresh generation guard: a slow, earlier-started refresh must not land
  // its stale snapshot over a newer one (import/remove trigger refreshes that
  // can overtake the mount refresh).
  const refreshSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    const stored = await listStoredPacks();
    // Backfill: records from before summaries existed get one now, computed
    // from their own bytes — once per legacy pack, then it's stored.
    for (const p of stored) {
      if (p.summary !== undefined) continue;
      const bytes = await getPackBytes(p.manifest.id);
      if (bytes === null) continue;
      try {
        const parsed = parsePack(new Uint8Array(bytes));
        p.summary = {
          pictures: parsed.pictures.length,
          hasPrompt: parsed.systemPrompt !== undefined,
        };
        await putPack(p.manifest, bytes, p.summary);
      } catch {
        // Unreadable bytes: leave the summary off; the pack still lists.
      }
    }
    if (seq !== refreshSeqRef.current) return; // superseded
    const manifests = stored.map((p) => p.manifest);
    const { healed, missing } = reconcile(
      readIndex(localStorage),
      manifests.map(toIndexEntry),
    );
    writeIndex(localStorage, healed);
    setEntries(buildEntries(manifests, missing));
    setPacks(
      [
        ...stored.map((p) => ({
          ...toIndexEntry(p.manifest),
          missing: false,
          manifest: p.manifest,
          summary: p.summary,
        })),
        ...missing.map((e) => ({ ...e, missing: true })),
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importPack = useCallback(
    async (file: File): Promise<PendingImport> => {
      const bytes = await file.arrayBuffer();
      const parsed = parsePack(new Uint8Array(bytes));
      const m = parsed.manifest;
      if (m.base !== undefined) {
        const err = overlayBaseError(m.base);
        if (err !== null) throw err;
      } else if (COMPANIONS[m.id] !== undefined) {
        // Same-id replacement of an IMPORTED pack stays allowed (the confirm
        // sheet's replace path) — this only blocks squatting a built-in id.
        throw new PackError("that id belongs to a built-in companion");
      }
      const replaces =
        readIndex(localStorage).find((e) => e.id === m.id) ?? null;
      return {
        manifest: m,
        replaces,
        commit: async () => {
          if (m.base !== undefined) {
            const err = overlayBaseError(m.base);
            if (err !== null) throw err;
          }
          await putPack(m, bytes, {
            pictures: parsed.pictures.length,
            hasPrompt: parsed.systemPrompt !== undefined,
          });
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

  // Resolve a pick to a playable Companion. Loads first, swaps after: the
  // previous variant's object URLs are revoked only once the new content is
  // in hand, so a failed or slow switch leaves the current pictures intact.
  // A pick overtaken by a newer one discards everything it created and
  // returns null — the caller just drops it.
  //
  // Both a base and an overlay load their own picture set, but applyOverlay
  // keeps only one of the two in full (never a merge) — so every URL created
  // during a resolve that isn't in the final companion's picture set is a
  // loser and must be revoked here, not left to leak. `created` collects
  // every URL made this call; on throw, all of it is revoked; otherwise the
  // non-winning subset is. Invariant after any outcome: the only live pack
  // object URLs are `urlsRef.current` (the committed winner's).
  const resolveVariant = useCallback(
    async (
      entry: LibraryEntry,
      packId: string | null,
    ): Promise<Companion | null> => {
      const seq = ++resolveSeqRef.current;
      const created: string[] = [];
      let companion: Companion;
      try {
        if (packId === null) {
          companion = entry.builtIn
            ? resolveDefault(entry.companion)
            : packToCompanion(await loadContent(entry.companion.id, created));
        } else {
          const base = entry.builtIn
            ? entry.companion
            : packToCompanionRaw(
                await loadContent(entry.companion.id, created),
              );
          companion = applyOverlay(base, await loadContent(packId, created));
        }
      } catch (e) {
        for (const url of created) URL.revokeObjectURL(url);
        throw e;
      }
      const winning = new Set((companion.pictures ?? []).map((p) => p.src));
      if (seq !== resolveSeqRef.current) {
        for (const url of created) URL.revokeObjectURL(url); // overtaken: nothing survives
        return null;
      }
      for (const url of created) {
        if (!winning.has(url)) URL.revokeObjectURL(url); // the losing set never shows
      }
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [...winning];
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

  // `refresh` is exposed because the chooser and the Goonpacks admin screen
  // each hold their own instance of this hook: a pack imported or removed on
  // one screen reaches the other by re-syncing when that screen shows.
  return {
    entries,
    packs,
    lastPlayed,
    importPack,
    removePack,
    resolveVariant,
    refresh,
  };
}
