"use client";
// The pack library. IndexedDB stores only zips; every load re-runs the full
// import pipeline over them (parse → validate → derive), so validity is one
// live verdict: a pack either passes today's rules and is offered, or it
// lists on the Goonpacks screen as incompatible — with the reason — and is
// offered nowhere. No stored derived state, no legacy special cases; an
// incompatible pack can heal on a later load (e.g. its base gets imported).
// All pack knowledge for the panels flows through here.
import { useCallback, useEffect, useRef, useState } from "react";
import { COMPANIONS, type Companion } from "@/lib/companions/companions";
import {
  buildEntries,
  keyId,
  keyVersion,
  newestFirst,
  packKey,
  type LibraryEntry,
  type LoadedPack,
  type PackOption,
  type PackSummary,
} from "@/lib/goonpacks/entries";
import { PackError, type PackManifest } from "@/lib/goonpacks/manifest";
import {
  parsePack,
  peekPack,
  type PackPeek,
  type ParsedPack,
} from "@/lib/goonpacks/pack";
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
  listPackRecords,
  putPack,
} from "@/lib/goonpacks/store";

export type { LibraryEntry, PackOption };
export type PendingImport = {
  manifest: PackManifest;
  summary: PackSummary;
  replaces: boolean; // this exact id+version is already installed
  commit(): Promise<void>;
};

// One row of the Goonpacks admin list, one per stored id@version. A valid
// pack carries its manifest and summary. An incompatible one carries every
// problem validation could determine, plus whatever we can still say about
// it: its manifest when only the cross-pack checks failed, or a best-effort
// peek when validation itself did.
export type PackRow = {
  id: string; // the storage key (id@version)
  manifest?: PackManifest;
  summary?: PackSummary;
  peek?: PackPeek;
  incompatible?: string[];
};

const summarize = (parsed: ParsedPack): PackSummary => ({
  pictures: parsed.pictures.length,
  hasPrompt: parsed.systemPrompt !== undefined,
});

// Cross-pack rules a zip can't know about itself: an overlay's base must be
// installed and must be a companion (built-in or complete pack), never
// another overlay. Applied at load over the parsed set — and at import for
// immediate feedback.
function baseError(
  manifest: PackManifest,
  isInstalled: (id: string) => "companion" | "overlay" | undefined,
): string | null {
  if (manifest.base === undefined) return null;
  const base = isInstalled(manifest.base);
  if (base === undefined) {
    return `This overlay changes ${manifest.base}, which isn't installed — import that pack first.`;
  }
  if (base === "overlay") {
    return "The base must be a complete companion, not another overlay.";
  }
  return null;
}

// Unzip a stored pack for play. Missing record → PackError (rare: removed
// between refreshes); pictures become object URLs, accounted for by
// resolveVariant. `collect` gets every object URL created.
async function loadContent(
  key: string, // storage key (id@version)
  collect?: string[],
): Promise<PackContent> {
  const zip = await getPackBytes(key);
  if (zip === null)
    throw new PackError(
      "The pack is gone from browser storage — re-import its zip.",
    );
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
        ref: `goonpack:${key}/${p.name}`,
      };
    }),
  };
}

export function useGoonpackLibrary() {
  // "loading" while the zips reindex (parse + validate, every load) — the
  // panels show a loading line rather than a half-empty library.
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [entries, setEntries] = useState<LibraryEntry[]>(() =>
    buildEntries([]),
  );
  const [packs, setPacks] = useState<PackRow[]>([]);
  // The currently-valid set, for import-time base checks.
  const validRef = useRef<Map<string, PackManifest>>(new Map());
  // Object URLs of the currently-committed pick — the only ones that should
  // ever be alive between resolveVariant calls.
  const urlsRef = useRef<string[]>([]);
  // Monotonic pick counter: only the newest resolveVariant commits its URLs.
  const resolveSeqRef = useRef(0);
  // Refresh generation guard: a slow, earlier-started refresh must not land
  // its stale snapshot over a newer one (import/remove trigger refreshes that
  // can overtake the mount refresh).
  const refreshSeqRef = useRef(0);

  // Reindex: re-import every stored zip through the one pipeline.
  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    const records = await listPackRecords();
    const valid: (LoadedPack & { key: string })[] = [];
    const bad: PackRow[] = [];
    for (const r of records) {
      // A stored value that isn't zip bytes is garbage, not a pack — it can
      // never validate, so drop the record rather than list it.
      if (!(r.zip instanceof ArrayBuffer)) {
        await deletePack(r.id);
        continue;
      }
      const bytes = new Uint8Array(r.zip);
      try {
        const parsed = parsePack(bytes);
        if (packKey(parsed.manifest) !== r.id) {
          throw new PackError(
            "The zip's id and version don't match the pack it was imported as.",
          );
        }
        valid.push({
          key: r.id,
          manifest: parsed.manifest,
          summary: summarize(parsed),
        });
      } catch (e) {
        bad.push({
          id: r.id,
          peek: peekPack(bytes),
          incompatible:
            e instanceof PackError
              ? e.problems
              : ["The stored zip couldn't be read."],
        });
      }
    }
    // Cross-pack pass over ids (versions of an id stand or fall together
    // for these): a complete pack squatting a built-in id, an id whose
    // versions disagree about being overlay or complete, then overlay base
    // rules against what remains.
    const kinds = new Map<string, Set<string>>();
    for (const p of valid) {
      const set = kinds.get(p.manifest.id) ?? new Set<string>();
      set.add(p.manifest.base === undefined ? "complete" : "overlay");
      kinds.set(p.manifest.id, set);
    }
    const isInstalled = (id: string): "companion" | "overlay" | undefined =>
      COMPANIONS[id] !== undefined || kinds.get(id)?.has("complete") === true
        ? "companion"
        : kinds.has(id)
          ? "overlay"
          : undefined;
    const survivors: (LoadedPack & { key: string })[] = [];
    for (const p of valid) {
      const id = p.manifest.id;
      let reason: string | null = null;
      if (kinds.get(id)!.size > 1) {
        reason =
          "Installed versions of this id disagree about being an overlay or a complete companion.";
      } else if (
        p.manifest.base === undefined &&
        COMPANIONS[id] !== undefined
      ) {
        reason =
          "The pack's id belongs to a built-in companion — pick a different id.";
      } else {
        reason = baseError(p.manifest, isInstalled);
      }
      if (reason === null) survivors.push(p);
      else {
        bad.push({ id: p.key, manifest: p.manifest, incompatible: [reason] });
      }
    }
    if (seq !== refreshSeqRef.current) return; // superseded
    validRef.current = new Map(survivors.map((p) => [p.key, p.manifest]));
    setEntries(buildEntries(survivors));
    setPacks(
      [
        ...survivors.map((p) => ({
          id: p.key,
          manifest: p.manifest,
          summary: p.summary,
        })),
        ...bad,
      ].sort(
        // Rows: ids alphabetical, versions ascending within an id — the
        // whole inventory reads one way (the chooser's pickers are where
        // newest-first means something).
        (a, b) =>
          keyId(a.id).localeCompare(keyId(b.id)) ||
          newestFirst(keyVersion(b.id), keyVersion(a.id)),
      ),
    );
    setStatus("ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importPack = useCallback(
    async (file: File): Promise<PendingImport> => {
      const bytes = await file.arrayBuffer();
      const parsed = parsePack(new Uint8Array(bytes));
      const m = parsed.manifest;
      // Immediate feedback on what the load pass would reject anyway.
      if (m.base === undefined && COMPANIONS[m.id] !== undefined) {
        throw new PackError(
          "The pack's id belongs to a built-in companion — pick a different id.",
        );
      }
      const err = baseError(m, (id) => {
        if (COMPANIONS[id] !== undefined) return "companion";
        for (const v of validRef.current.values()) {
          if (v.id === id) {
            return v.base === undefined ? "companion" : "overlay";
          }
        }
        return undefined;
      });
      if (err !== null) throw new PackError(err);
      return {
        manifest: m,
        summary: summarize(parsed),
        // Versions coexist: only the exact same id+version is replaced.
        replaces: validRef.current.has(packKey(m)),
        commit: async () => {
          await putPack(packKey(m), bytes);
          await refresh();
        },
      };
    },
    [refresh],
  );

  // Removal never cascades: overlays of a removed base stay stored and simply
  // list as incompatible ("base companion isn't installed") until the base
  // returns.
  // Threads are untouched either way.
  const removePack = useCallback(
    async (id: string) => {
      await deletePack(id);
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
      // The card's two selects: which base version (null = the built-in
      // herself) and which overlay version (null = none).
      baseKey: string | null,
      overlayKey: string | null,
    ): Promise<Companion | null> => {
      const seq = ++resolveSeqRef.current;
      const created: string[] = [];
      let companion: Companion;
      try {
        if (overlayKey === null) {
          companion =
            baseKey === null
              ? resolveDefault(entry.companion)
              : packToCompanion(await loadContent(baseKey, created));
        } else {
          const base =
            baseKey === null
              ? entry.companion
              : packToCompanionRaw(await loadContent(baseKey, created));
          companion = applyOverlay(
            base,
            await loadContent(overlayKey, created),
          );
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
      return companion;
    },
    [],
  );

  // `refresh` is exposed because the chooser and the Goonpacks admin screen
  // each hold their own instance of this hook: a pack imported or removed on
  // one screen reaches the other by re-syncing when that screen shows.
  return {
    status,
    entries,
    packs,
    importPack,
    removePack,
    resolveVariant,
    refresh,
  };
}
