// A pack's tree → ParsedPack. Validation is a pass over NAMES. These are all
// name rules:
//
// - permitted extensions;
// - no subfolders;
// - no stem collisions;
// - sidecar pairing;
// - the complete-vs-overlay completeness rules.
//
// So only manifest.json, system-prompt.md and the sidecars are ever read.
// Validating a multi-gigabyte pack costs a few hundred kilobytes.
//
// **`media` is valid media and nothing else** — a file whose extension
// MEDIA_TYPES knows AND whose sidecar parseSidecar accepted. A file failing the
// first is a fatal problem; one with no sidecar yet is left out and the pack
// still builds. So nothing downstream re-decides validity, and nothing has to
// read a text field being empty as a verdict.
//
// This is the ONE place those two checks run, which is what makes building and
// importing the same: goonpack-build.ts calls parsePack over the source tree
// before zipping, and the app calls it over the extracted tree at import and
// again at every load (library.ts). A pack that builds is a pack that imports,
// and the media it lists is the same set either way.
import { PackError, parseManifest, type PackManifest } from './manifest';
import { isJunkPath, splitName, MEDIA_TYPES, type MediaKind } from './media';
import {
  parseSidecar,
  SIDECAR_EXT,
  type Sidecar,
  type SidecarValue,
} from './sidecar';

export const MANIFEST = 'manifest.json';
const PROMPT = 'system-prompt.md';
// The media folder, twice over: its own name (what opens it in a tree) and the
// prefix its files carry in a '/'-separated listing (what validation matches).
export const MEDIA_NAME = 'media';
export const MEDIA_DIR = `${MEDIA_NAME}/`;

// The name up to the first dot — the item a file belongs to, rather than the
// file. `splitName` splits at the last dot, which is what pairs `beach.jpg`
// with `beach.md`; this is what gathers everything else an item accumulates
// (`beach.labels.json`, `beach.2026-08-02-baseline.raw.txt`) under the picture
// itself, so a tool keeping its working files beside the media adds no names
// that look stray.
const baseName = (file: string): string => file.split('.')[0] ?? file;

// What a pack looks like to validation: the file names it holds (relative to
// the pack root, '/'-separated) and a way to read one as text. OPFS backs it in
// the app; node fs backs it in the authoring build script; a plain object backs
// it in the tests.
export type PackTree = {
  names: string[];
  readText(path: string): Promise<string>;
};

// Optional progress for the two passes that run once per file. The app passes
// neither — it validates a pack it has just extracted, with the extraction's
// own progress already on screen. The authoring build draws a counter, because
// a pack of a few thousand pictures spends long enough in each pass to look
// stopped.
export type PackProgress = {
  // Names under media/ sorted into media, sidecar or stray.
  checked?: (done: number, total: number) => void;
  // Sidecars read off disk and parsed.
  read?: (done: number, total: number) => void;
};

// One still or video the app will offer — valid media, which is the two checks
// the format defines both passing: MEDIA_TYPES knows the extension, and
// parseSidecar accepted the sidecar beside it. parsePack builds one only then,
// so both texts are always filled and nothing downstream re-derives validity
// from a field being empty.
//
// `name` is the stem — the thread ref's second half and the sidecar's name;
// `file` is the file inside media/, which is what actually gets opened when the
// item is first rendered. `caption` is the one line the model picks from,
// `description` the long prose behind it.
export type ParsedMedia = {
  name: string;
  file: string;
  kind: MediaKind;
  mimeType: string;
  caption: string;
  description: string;
  // The rest of the sidecar's frontmatter, carried rather than read: what a
  // pack records about an item is inference's to decide (sidecar.ts), so
  // nothing here knows the keys.
  values: Record<string, SidecarValue>;
};

export type ParsedPack = {
  manifest: PackManifest;
  systemPrompt?: string;
  media: ParsedMedia[];
  // What is under media/ but isn't playable media, reported rather than
  // refused: `strays` are basenames no media file carries, `undescribed` are
  // media files with no sidecar yet. Neither stops a pack, because media/ is a
  // working directory as often as it is a finished set — a describing pass
  // half done, or another tool keeping its own files beside the pictures.
  // scripts/lib/goonpack-report.ts turns them into the build's warning lines.
  strays: string[];
  undescribed: string[];
};

// Best-effort look at a manifest that failed validation, so the admin row can
// still say what the pack claims to be (name, version, what it overlays).
// String fields are taken at face value — this describes, never validates;
// anything unreadable just comes back empty.
export type PackPeek = {
  name?: string;
  version?: string;
  base?: string;
  aboutThePack?: string;
};

export function peekManifest(raw: string): PackPeek {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const m = parsed as Record<string, unknown>;
    const peek: PackPeek = {};
    for (const k of ['version', 'base', 'aboutThePack'] as const) {
      const v = m[k];
      if (typeof v === 'string') peek[k] = v;
    }
    // The name sits in the companion section (leniently: or top-level, as a
    // pre-restructure manifest would have it).
    const c = m.companion;
    const name =
      typeof c === 'object' && c !== null && !Array.isArray(c)
        ? (c as Record<string, unknown>).name
        : m.name;
    if (typeof name === 'string') peek.name = name;
    return peek;
  } catch {
    return {};
  }
}

// The one structural fault worth naming: everything landed under a single
// top-level folder because the folder was zipped instead of its contents.
// Takes junk-filtered names — a `__MACOSX/` entry is a second top-level folder
// to anything counting them, which is how a Finder zip hides the fault.
export function wrapperFolder(names: string[]): string | null {
  const tops = new Set<string>();
  for (const n of names) {
    const slash = n.indexOf('/');
    if (slash === -1) return null; // a file at the root — not wrapped
    tops.add(n.slice(0, slash));
  }
  const only = [...tops];
  return only.length === 1 ? only[0]! : null;
}

// Like parseManifest, parsePack reports every problem it can determine in one
// throw: the manifest's problems plus the tree-level ones. Only a tree with no
// root manifest fails alone.
export async function parsePack(
  tree: PackTree,
  progress?: PackProgress,
): Promise<ParsedPack> {
  const names = tree.names.filter((n) => !isJunkPath(n));

  if (!names.includes(MANIFEST)) {
    const wrapper = wrapperFolder(names);
    throw new PackError(
      wrapper !== null
        ? `Everything is inside ${wrapper}/ — zip the folder's contents, not the folder.`
        : "No manifest.json at the pack root — zip the pack folder's contents, not the folder.",
    );
  }

  const problems: string[] = [];
  let manifest: PackManifest | undefined;
  try {
    manifest = parseManifest(JSON.parse(await tree.readText(MANIFEST)));
  } catch (e) {
    if (e instanceof PackError) problems.push(...e.problems);
    else
      problems.push(
        "manifest.json isn't valid JSON — check for missing quotes or commas.",
      );
  }

  const systemPrompt = names.includes(PROMPT)
    ? await tree.readText(PROMPT)
    : undefined;

  const media: ParsedMedia[] = [];
  const sidecarPaths: string[] = [];
  const sidecars = new Map<string, Sidecar>();
  // Basenames under media/ that no playable file turned out to carry. Collected
  // as they are met and filtered against the media set below, since a name is
  // only stray once nothing has claimed it.
  const strays = new Set<string>();
  // Every path is either the manifest, the prompt, something under media/, or
  // something that has no place in a pack. The last of those is a problem, not
  // something to skip: a skipped path is a stray folder riding into a built
  // pack unnoticed.
  const underMedia = names.filter((p) => p.startsWith(MEDIA_DIR)).length;
  let checked = 0;
  for (const path of names) {
    if (path === MANIFEST || path === PROMPT) continue;
    if (!path.startsWith(MEDIA_DIR)) {
      problems.push(
        `${path} doesn't belong in a pack — a pack holds manifest.json, system-prompt.md and a media/ folder.`,
      );
      continue;
    }
    progress?.checked?.(++checked, underMedia);
    const file = path.slice(MEDIA_DIR.length);
    if (file.includes('/')) {
      problems.push(`media/ can't contain subfolders — found ${path}.`);
      continue;
    }
    const { stem, ext } = splitName(file);
    if (ext === SIDECAR_EXT) {
      sidecarPaths.push(path);
      continue;
    }
    if (ext === 'mov') {
      problems.push(
        `${file} is a .mov — videos must be .mp4 or .webm, which play everywhere; .mov doesn't.`,
      );
      continue;
    }
    const type = MEDIA_TYPES[ext];
    if (type === undefined) {
      strays.add(baseName(file));
      continue;
    }
    media.push({
      name: stem,
      file,
      kind: type.kind,
      mimeType: type.mimeType,
      caption: '',
      description: '',
      values: {},
    });
  }
  // Sidecars are the only media-folder files ever read — a couple of kilobytes
  // of text each, never the media they describe. A sidecar that won't parse is
  // a problem naming the sidecar, so the author knows which file to fix; one
  // that isn't there yet is not, so a pack still being described keeps
  // building. captionWarning (scripts/lib/goonpack-report.ts) is what reports
  // those at build time.
  const sidecarStems = new Set<string>();
  let read = 0;
  for (const path of sidecarPaths) {
    progress?.read?.(++read, sidecarPaths.length);
    const stem = splitName(path.slice(MEDIA_DIR.length)).stem;
    sidecarStems.add(stem);
    try {
      sidecars.set(stem, parseSidecar(await tree.readText(path)));
    } catch (e) {
      problems.push(
        `${path}: ${e instanceof Error ? e.message : String(e)}`.trim(),
      );
    }
  }

  const stems = new Set<string>();
  const described: ParsedMedia[] = [];
  for (const m of media) {
    // Different extensions, same stem (a.jpg + a.mp4) would collide to one
    // thread ref (goonpack:<key>/a) — reject at import, not silently drop.
    if (stems.has(m.name)) {
      problems.push(
        `Two media files share the name ${m.name} — same name with different file types; rename one.`,
      );
    }
    // Every file that got this far is one, described or not, so the
    // sidecar-pairing check sees it and a later sidecar for it isn't reported
    // as orphaned.
    stems.add(m.name);
    // The sidecar check — the one that decides whether this counts as described
    // media. A file whose sidecar wouldn't parse never reaches `described`
    // either: that pushed a problem above, and problems are fatal.
    const parsed = sidecars.get(m.name);
    if (parsed === undefined) continue;
    m.caption = parsed.caption;
    m.description = parsed.description;
    m.values = parsed.values;
    described.push(m);
  }
  // A sidecar with no media file is the same miss from the other side — a
  // rename that moved one and not the other — so it joins the stray basenames
  // rather than getting a rule of its own.
  for (const stem of sidecarStems) {
    if (!stems.has(stem)) strays.add(baseName(stem));
  }
  // A basename is sound the moment any playable file carries it, whatever else
  // sits alongside: `a.jpg` beside `a.labels.json` and `a.baseline.raw.txt` is
  // one described picture, not a picture and two complaints.
  for (const m of media) strays.delete(baseName(m.file));
  described.sort((a, b) => a.name.localeCompare(b.name));

  // Completeness rules need a readable manifest to know overlay from complete —
  // without one, the manifest's own problems already tell the story.
  if (manifest !== undefined) {
    if (manifest.base === undefined) {
      if (systemPrompt === undefined) {
        problems.push('A complete pack needs a system-prompt.md file.');
      }
      if (!manifest.companion.name) {
        problems.push(
          'A complete pack needs a name field in the companion section of manifest.json.',
        );
      }
      if (!manifest.companion.voiceId) {
        problems.push(
          'A complete pack needs a voiceId field in the companion section of manifest.json.',
        );
      }
      if (!manifest.companion.description) {
        problems.push(
          'A complete pack needs a description field in the companion section of manifest.json.',
        );
      }
      // The transcript opens on it, so a companion nothing has been written for
      // starts on a blank screen. An overlay is not checked: it inherits the
      // base's scene unless it has moved it.
      if (manifest.intro === undefined) {
        problems.push(
          'A complete pack needs an intro field in manifest.json — the situation the thread opens on, written to the person playing.',
        );
      }
      // usesRealTime defaults to true, so a pack states which it is rather
      // than implying it by leaving a field out. An overlay is not checked
      // here: it may take the zone from its base, which only resolution knows
      // (library.ts).
      if (
        manifest.companion.usesRealTime !== false &&
        manifest.companion.timezone === undefined
      ) {
        problems.push(
          'A complete pack needs a timezone field in the companion section of manifest.json, or usesRealTime: false if the persona sets its own time of day.',
        );
      }
    }
    // Any media file at all contradicts noMedia, described or not — the
    // contradiction is the folder being there, not what is in it. So this reads
    // `media`, every supported file, rather than `described`.
    if (manifest.noMedia === true && media.length > 0) {
      problems.push(
        'noMedia is set but the pack has a media/ folder — remove one or the other.',
      );
    }
    // The companion is told what the set holds rather than handed a list of it,
    // so a set with nothing said about it is incomplete in the same way a
    // complete pack with no name is. A pack whose files are all still waiting
    // for sidecars offers no media yet, so it needs no summary yet either.
    if (described.length > 0 && manifest.mediaSummary === undefined) {
      problems.push(
        'A pack with media needs a mediaSummary in manifest.json — npm run goonpack:summarise writes it.',
      );
    }
  }
  if (problems.length > 0 || manifest === undefined) {
    throw new PackError(problems);
  }
  return {
    manifest,
    systemPrompt,
    media: described,
    strays: [...strays].sort((a, b) => a.localeCompare(b)),
    // By subtraction rather than by re-deciding anything: every entry in
    // `media` passed the extension check, and the ones missing from `described`
    // are exactly those with no sidecar yet.
    undescribed: media
      .filter((m) => !sidecars.has(m.name))
      .map((m) => m.file)
      .sort((a, b) => a.localeCompare(b)),
  };
}
