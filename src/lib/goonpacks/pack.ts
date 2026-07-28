// A pack's tree → ParsedPack. Validation is a pass over NAMES: permitted
// extensions, no subfolders, no stem collisions, sidecar pairing and the
// complete-vs-overlay completeness rules are all name rules, so only
// manifest.json, system-prompt.md and the sidecars are ever read. Validating a
// multi-gigabyte pack costs a few hundred kilobytes.
import { PackError, parseManifest, type PackManifest } from './manifest';
import { isJunkPath, splitName, MEDIA_TYPES, type MediaKind } from './media';
import { parseSidecar, SIDECAR_EXT, type Sidecar } from './sidecar';

export const MANIFEST = 'manifest.json';
const PROMPT = 'system-prompt.md';
// The media folder, twice over: its own name (what opens it in a tree) and the
// prefix its files carry in a '/'-separated listing (what validation matches).
export const MEDIA_NAME = 'media';
export const MEDIA_DIR = `${MEDIA_NAME}/`;

// What a pack looks like to validation: the file names it holds (relative to
// the pack root, '/'-separated) and a way to read one as text. OPFS backs it in
// the app; node fs backs it in the authoring build script; a plain object backs
// it in the tests.
export type PackTree = {
  names: string[];
  readText(path: string): Promise<string>;
};

// One still or video. `name` is the stem — the thread ref's second half and the
// sidecar's name; `file` is the file inside media/, which is what actually gets
// opened when the item is first rendered. Both texts come from the sidecar and
// are required: `caption` is the one line the model picks from, `description`
// the long prose behind it.
export type ParsedMedia = {
  name: string;
  file: string;
  kind: MediaKind;
  mimeType: string;
  caption: string;
  description: string;
};

export type ParsedPack = {
  manifest: PackManifest;
  systemPrompt?: string;
  media: ParsedMedia[];
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
export async function parsePack(tree: PackTree): Promise<ParsedPack> {
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
  // Every path is either the manifest, the prompt, something under media/, or
  // something that has no place in a pack. Skipping the last of those is what
  // let a stray folder ride along unnoticed into a built pack.
  for (const path of names) {
    if (path === MANIFEST || path === PROMPT) continue;
    if (!path.startsWith(MEDIA_DIR)) {
      problems.push(
        `${path} doesn't belong in a pack — a pack holds manifest.json, system-prompt.md and a media/ folder.`,
      );
      continue;
    }
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
      problems.push(
        `Unsupported file in media/: ${file} — media must be jpg, jpeg, png, webp, mp4 or webm, each with a matching .${SIDECAR_EXT} sidecar.`,
      );
      continue;
    }
    media.push({
      name: stem,
      file,
      kind: type.kind,
      mimeType: type.mimeType,
      caption: '',
      description: '',
    });
  }
  // Sidecars are the only media-folder files ever read — a couple of kilobytes
  // of text each, never the media they describe. A sidecar that won't parse is
  // a problem naming the sidecar, so the author knows which file to fix.
  const sidecarStems = new Set<string>();
  for (const path of sidecarPaths) {
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
  for (const m of media) {
    // Different extensions, same stem (a.jpg + a.mp4) would collide to one
    // thread ref (goonpack:<key>/a) — reject at import, not silently drop.
    if (stems.has(m.name)) {
      problems.push(
        `Two media files share the name ${m.name} — same name with different file types; rename one.`,
      );
    }
    stems.add(m.name);
    const parsed = sidecars.get(m.name);
    if (parsed !== undefined) {
      m.caption = parsed.caption;
      m.description = parsed.description;
    } else if (!sidecarStems.has(m.name)) {
      // A sidecar that failed to parse already reported itself above; this is
      // the one that isn't there at all.
      problems.push(
        `${m.file} has no ${m.name}.${SIDECAR_EXT} beside it — every media file needs one, holding its caption and description (npm run goonpack:describe-missing writes them).`,
      );
    }
  }
  // A sidecar with no media file is the pairing seen from the other side: a
  // rename that moved one and not the other, and nothing else would report it.
  for (const stem of sidecarStems) {
    if (!stems.has(stem)) {
      problems.push(
        `${stem}.${SIDECAR_EXT} has no media file beside it — remove it, or add the picture or video it describes.`,
      );
    }
  }
  media.sort((a, b) => a.name.localeCompare(b.name));

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
    }
    if (manifest.noMedia === true && media.length > 0) {
      problems.push(
        'noMedia is set but the pack has a media/ folder — remove one or the other.',
      );
    }
    // The companion is told what the set holds rather than handed a list of it,
    // so a set with nothing said about it is incomplete in the same way a
    // complete pack with no name is.
    if (media.length > 0 && manifest.mediaSummary === undefined) {
      problems.push(
        'A pack with media needs a mediaSummary in manifest.json — npm run goonpack:summarise writes it.',
      );
    }
  }
  if (problems.length > 0 || manifest === undefined) {
    throw new PackError(problems);
  }
  return { manifest, systemPrompt, media };
}
