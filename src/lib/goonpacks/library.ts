// The pack library, built in memory at every app load by walking the OPFS
// trees. Nothing derived is persisted, so validity is one live verdict: a pack
// either passes today's rules and is offered, or it lists on the Goonpacks
// screen as incompatible — with the reason — and is offered nowhere. An
// incompatible pack heals on a later load (e.g. its base gets imported).
//
// The source is injected so this whole pass is testable without OPFS; the app
// passes the OPFS-backed one from store.ts.
import { COMPANIONS, type CompanionMedia } from '@/lib/companions/companions';
import {
  buildEntries,
  countMedia,
  keyId,
  keyVersion,
  newestFirst,
  packKey,
  type LibraryEntry,
  type LoadedPack,
  type PackSummary,
} from './entries';
import { PackError, type PackManifest } from './manifest';
import {
  MANIFEST,
  parsePack,
  peekManifest,
  type PackPeek,
  type PackTree,
  type ParsedMedia,
} from './pack';
import type { PackContent } from './resolve';

export type LibrarySource = {
  listKeys(): Promise<string[]>;
  openTree(key: string): Promise<PackTree | null>;
  mediaUrl(key: string, media: ParsedMedia): Promise<string>;
};

// One row of the Goonpacks admin list, one per installed id@version. A valid
// pack carries its manifest and summary. An incompatible one carries every
// problem validation could determine, plus whatever we can still say about it:
// its manifest when only the cross-pack checks failed, or a best-effort peek
// when validation itself did.
export type PackRow = {
  id: string;
  manifest?: PackManifest;
  summary?: PackSummary;
  peek?: PackPeek;
  incompatible?: string[];
};

export type Library = {
  entries: LibraryEntry[];
  rows: PackRow[];
  content: Map<string, PackContent>;
  manifests: Map<string, PackManifest>;
};

// Cross-pack rules a tree can't know about itself: an overlay's base must be
// installed and must be a companion (built-in or complete pack), never another
// overlay. Applied at load over the parsed set — and at import for immediate
// feedback.
export function baseError(
  manifest: PackManifest,
  isInstalled: (id: string) => 'companion' | 'overlay' | undefined,
): string | null {
  if (manifest.base === undefined) return null;
  const base = isInstalled(manifest.base);
  if (base === undefined) {
    return `This overlay changes ${manifest.base}, which isn't installed — import that pack first.`;
  }
  if (base === 'overlay') {
    return 'The base must be a complete companion, not another overlay.';
  }
  return null;
}

const summarize = (media: ParsedMedia[], hasPrompt: boolean): PackSummary => ({
  media: countMedia(media),
  hasPrompt,
});

// A media entry whose object URL is minted on first render and memoised here:
// a pack can hold thousands of files, most of which are never shown. The URL
// then lives as long as this entry — and the entry outlives the index it was
// built for, until its pack is removed or re-imported (carryMediaOver).
//
// The memo is `pending`, held for the entry's whole life so load() reads a file
// once however often it is called. `forget()` is the one way out of that, and
// what carryMediaOver uses after revoking a URL.
function mediaEntry(
  source: LibrarySource,
  key: string,
  m: ParsedMedia,
): CompanionMedia {
  let pending: Promise<string> | null = null;
  const entry: CompanionMedia = {
    kind: m.kind,
    caption: m.caption,
    description: m.description,
    // Stable thread reference: object URLs die with the session, so the thread
    // persists this ref and rendering resolves it.
    ref: `goonpack:${key}/${m.name}`,
    load: () =>
      (pending ??= source.mediaUrl(key, m).then(
        (url) => {
          entry.src = url;
          return url;
        },
        (e: unknown) => {
          // Forget a failed open: one unreadable moment shouldn't pin the item
          // as missing for the rest of the session — the next render retries.
          pending = null;
          throw e;
        },
      )),
    forget: () => {
      pending = null;
      entry.src = undefined;
    },
  };
  return entry;
}

export async function buildLibrary(source: LibrarySource): Promise<Library> {
  const valid: (LoadedPack & { key: string; content: PackContent })[] = [];
  const bad: PackRow[] = [];

  for (const key of await source.listKeys()) {
    const tree = await source.openTree(key);
    if (tree === null) continue; // removed between the listing and the read
    try {
      const parsed = await parsePack(tree);
      if (packKey(parsed.manifest) !== key) {
        throw new PackError(
          "The pack's id and version don't match the pack it was imported as.",
        );
      }
      valid.push({
        key,
        manifest: parsed.manifest,
        summary: summarize(parsed.media, parsed.systemPrompt !== undefined),
        content: {
          manifest: parsed.manifest,
          systemPrompt: parsed.systemPrompt,
          media: parsed.media.map((m) => mediaEntry(source, key, m)),
        },
      });
    } catch (e) {
      let peek: PackPeek = {};
      try {
        peek = peekManifest(await tree.readText(MANIFEST));
      } catch {
        // a tree we can't even read a manifest out of describes itself as nothing
      }
      bad.push({
        id: key,
        peek,
        incompatible:
          e instanceof PackError ? e.problems : ["The pack couldn't be read."],
      });
    }
  }

  // Cross-pack pass over ids (versions of an id stand or fall together for
  // these): a complete pack squatting a built-in id, an id whose versions
  // disagree about being overlay or complete, then overlay base rules against
  // what remains.
  const kinds = new Map<string, Set<string>>();
  for (const p of valid) {
    const set = kinds.get(p.manifest.id) ?? new Set<string>();
    set.add(p.manifest.base === undefined ? 'complete' : 'overlay');
    kinds.set(p.manifest.id, set);
  }
  const isInstalled = (id: string): 'companion' | 'overlay' | undefined =>
    COMPANIONS[id] !== undefined || kinds.get(id)?.has('complete') === true
      ? 'companion'
      : kinds.has(id)
        ? 'overlay'
        : undefined;

  const survivors: typeof valid = [];
  for (const p of valid) {
    const id = p.manifest.id;
    let reason: string | null;
    if (kinds.get(id)!.size > 1) {
      reason =
        'Installed versions of this id disagree about being an overlay or a complete companion.';
    } else if (p.manifest.base === undefined && COMPANIONS[id] !== undefined) {
      reason =
        "The pack's id belongs to a built-in companion — pick a different id.";
    } else {
      reason = baseError(p.manifest, isInstalled);
    }
    if (reason === null) survivors.push(p);
    else bad.push({ id: p.key, manifest: p.manifest, incompatible: [reason] });
  }

  return {
    entries: buildEntries(survivors),
    content: new Map(survivors.map((p) => [p.key, p.content])),
    manifests: new Map(survivors.map((p) => [p.key, p.manifest])),
    rows: [
      ...survivors.map((p) => ({
        id: p.key,
        manifest: p.manifest,
        summary: p.summary,
      })),
      ...bad,
    ].sort(
      // Rows: ids alphabetical, versions ascending within an id — the whole
      // inventory reads one way (the chooser's pickers are where newest-first
      // means something).
      (a, b) =>
        keyId(a.id).localeCompare(keyId(b.id)) ||
        newestFirst(keyVersion(b.id), keyVersion(a.id)),
    ),
  };
}

// Hand the outgoing index's media over to the one replacing it. A pack that is
// still installed and untouched keeps its very entry objects, URLs and all: a
// Companion resolved before the rebuild — and everything already sent in the
// thread — holds those objects, and revoking their URLs would break media that
// is on screen. Only what the new index doesn't adopt is revoked: packs that
// were removed, packs whose tree an import just replaced (`replaced`), and
// individual files that have gone from a carried-over pack.
//
// Still INSTALLED, note, not still offered: a pack can drop out of `content`
// by turning incompatible (its base was removed) while its media is on screen
// in a thread, and that is media the app can still render, not media to break.
// It has a row either way, which is what says it is installed.
export function carryMediaOver(
  previous: Library,
  next: Library,
  replaced: ReadonlySet<string>,
): void {
  const revoke = (
    media: CompanionMedia[],
    keep?: ReadonlySet<CompanionMedia>,
  ) => {
    for (const m of media) {
      if (m.src !== undefined && keep?.has(m) !== true) {
        URL.revokeObjectURL(m.src);
        // The entry is still reachable through any Companion resolved before
        // this rebuild, so the memo goes with the URL: a revoked URL renders as
        // a blank frame, while an entry holding none goes back to disk and — for
        // a pack that has gone — settles on the missing placeholder.
        m.forget();
      }
    }
  };
  // Every key the new index saw on disk, offered or not: a row is what an
  // installed pack always has.
  const installed = new Set(next.rows.map((r) => r.id));
  for (const [key, before] of previous.content) {
    if (replaced.has(key)) {
      revoke(before.media); // re-imported: these entries point at files that are gone
      continue;
    }
    const after = next.content.get(key);
    if (after === undefined) {
      if (installed.has(key)) continue; // still on disk, just no longer offered
      revoke(before.media);
      continue;
    }
    const carried = new Map(before.media.map((m) => [m.ref, m]));
    after.media = after.media.map((m) => carried.get(m.ref) ?? m);
    revoke(before.media, new Set(after.media));
  }
}
