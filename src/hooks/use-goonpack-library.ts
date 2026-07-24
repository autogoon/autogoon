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
  type LibraryEntry,
  type LoadedPack,
  type PackSummary,
  type Variant,
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

export type { LibraryEntry, Variant };
export type PendingImport = {
  manifest: PackManifest;
  replaces: boolean; // an installed pack already holds this id
  commit(): Promise<void>;
};

// One row of the Goonpacks admin list. A valid pack carries its manifest and
// summary. An incompatible one carries the reason it failed today's rules,
// plus whatever we can still say about it: its manifest when only the
// cross-pack checks failed, or a best-effort peek when validation itself did.
export type PackRow = {
  id: string;
  manifest?: PackManifest;
  summary?: PackSummary;
  peek?: PackPeek;
  incompatible?: string;
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
    return `needs its base installed first: ${manifest.base}`;
  }
  if (base === "overlay") return "base must be a companion, not an overlay";
  return null;
}

// Unzip a stored pack for play. Missing record → PackError (rare: removed
// between refreshes); pictures become object URLs, accounted for by
// resolveVariant. `collect` gets every object URL created.
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
    const valid: (LoadedPack & { id: string })[] = [];
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
        if (parsed.manifest.id !== r.id) {
          throw new PackError("zip id doesn't match its slot");
        }
        valid.push({
          id: r.id,
          manifest: parsed.manifest,
          summary: summarize(parsed),
        });
      } catch (e) {
        bad.push({
          id: r.id,
          peek: peekPack(bytes),
          incompatible: e instanceof PackError ? e.message : "unreadable zip",
        });
      }
    }
    // Cross-pack pass: a complete pack squatting a built-in id, then overlay
    // base rules against what remains.
    const completes = new Map(
      valid
        .filter((p) => p.manifest.base === undefined)
        .map((p) => [p.id, p] as const),
    );
    const survivors: (LoadedPack & { id: string })[] = [];
    for (const p of valid) {
      let reason: string | null = null;
      if (p.manifest.base === undefined && COMPANIONS[p.id] !== undefined) {
        reason = "that id belongs to a built-in companion";
      } else {
        reason = baseError(p.manifest, (id) =>
          COMPANIONS[id] !== undefined || completes.has(id)
            ? "companion"
            : valid.some((v) => v.id === id)
              ? "overlay"
              : undefined,
        );
      }
      if (reason === null) survivors.push(p);
      else bad.push({ id: p.id, manifest: p.manifest, incompatible: reason });
    }
    if (seq !== refreshSeqRef.current) return; // superseded
    validRef.current = new Map(survivors.map((p) => [p.id, p.manifest]));
    setEntries(buildEntries(survivors));
    setPacks(
      [
        ...survivors.map((p) => ({
          id: p.id,
          manifest: p.manifest,
          summary: p.summary,
        })),
        ...bad,
      ].sort((a, b) => a.id.localeCompare(b.id)),
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
        throw new PackError("that id belongs to a built-in companion");
      }
      const err = baseError(m, (id) => {
        if (COMPANIONS[id] !== undefined) return "companion";
        const installed = validRef.current.get(id);
        if (installed === undefined) return undefined;
        return installed.base === undefined ? "companion" : "overlay";
      });
      if (err !== null) throw new PackError(err);
      return {
        manifest: m,
        replaces: validRef.current.has(m.id),
        commit: async () => {
          await putPack(m.id, bytes);
          await refresh();
        },
      };
    },
    [refresh],
  );

  // Removal never cascades: overlays of a removed base stay stored and simply
  // list as incompatible ("needs its base installed") until the base returns.
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
