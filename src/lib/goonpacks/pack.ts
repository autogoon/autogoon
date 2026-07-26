// Zip → ParsedPack. Pure and synchronous (packs are a few MB); used by the
// browser importer, the Jest tests, and nothing else — the authoring build
// script has its own Node-side zip writer.
import { strFromU8, unzipSync } from 'fflate';
import { PackError, parseManifest, type PackManifest } from './manifest';
import { MEDIA_TYPES, isJunkPath, splitName } from './media';

export type ParsedPicture = {
  name: string;
  description: string;
  bytes: Uint8Array;
  mimeType: string;
};

export type ParsedPack = {
  manifest: PackManifest;
  systemPrompt?: string;
  pictures: ParsedPicture[];
};

// Best-effort look inside a zip that failed validation, so the admin row can
// still say what the pack claims to be (name, version, what it overlays).
// String fields are taken at face value — this describes, never validates;
// anything unreadable just comes back empty.
export type PackPeek = {
  name?: string;
  version?: string;
  base?: string;
  aboutThePack?: string;
};

export function peekPack(zipBytes: Uint8Array): PackPeek {
  try {
    const entry = unzipSync(zipBytes)['manifest.json'];
    if (entry === undefined) return {};
    const raw: unknown = JSON.parse(strFromU8(entry));
    if (typeof raw !== 'object' || raw === null) return {};
    const m = raw as Record<string, unknown>;
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

// Like parseManifest, parsePack reports every problem it can determine in
// one throw: the manifest's problems plus the zip-level ones. Only a zip we
// can't read at all — or one with no root manifest — fails alone.
export function parsePack(zipBytes: Uint8Array): ParsedPack {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    throw new PackError('Not a readable zip file.');
  }
  const files = Object.entries(entries).filter(([path]) => !isJunkPath(path));

  const manifestEntry = files.find(([path]) => path === 'manifest.json');
  if (manifestEntry === undefined) {
    throw new PackError(
      "No manifest.json at the zip root — zip the pack folder's contents, not the folder.",
    );
  }
  const problems: string[] = [];
  let manifest: PackManifest | undefined;
  try {
    manifest = parseManifest(JSON.parse(strFromU8(manifestEntry[1])));
  } catch (e) {
    if (e instanceof PackError) problems.push(...e.problems);
    else
      problems.push(
        "manifest.json isn't valid JSON — check for missing quotes or commas.",
      );
  }

  const promptEntry = files.find(([path]) => path === 'system-prompt.md');
  const systemPrompt =
    promptEntry !== undefined ? strFromU8(promptEntry[1]) : undefined;

  const pictures: ParsedPicture[] = [];
  const sidecars = new Map<string, string>();
  for (const [path, bytes] of files) {
    if (!path.startsWith('pictures/')) continue;
    const file = path.slice('pictures/'.length);
    if (file.includes('/')) {
      problems.push(`pictures/ can't contain subfolders — found ${path}.`);
      continue;
    }
    const { stem, ext } = splitName(file);
    if (ext === 'txt') {
      sidecars.set(stem, strFromU8(bytes).trim());
    } else {
      const type = MEDIA_TYPES[ext];
      if (type?.kind === 'image') {
        pictures.push({
          name: stem,
          description: '',
          bytes,
          mimeType: type.mimeType,
        });
      } else {
        problems.push(
          `Unsupported file in pictures/: ${file} — pictures must be jpg, jpeg, png or webp, with descriptions in matching .txt files.`,
        );
      }
    }
  }
  const stems = new Set<string>();
  for (const p of pictures) {
    // Different extensions, same stem (a.jpg + a.png) would collide to one
    // thread ref (goonpack:<packId>/a) — reject at import, not silently drop.
    if (stems.has(p.name)) {
      problems.push(
        `Two pictures share the name ${p.name} — same name with different file types; rename one.`,
      );
    }
    stems.add(p.name);
  }
  for (const p of pictures) p.description = sidecars.get(p.name) ?? '';
  pictures.sort((a, b) => a.name.localeCompare(b.name));

  // Completeness rules need a readable manifest to know overlay from
  // complete — without one, the manifest's own problems already tell the
  // story.
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
    if (manifest.noMedia === true && pictures.length > 0) {
      problems.push(
        'noMedia is set but the pack has a media/ folder — remove one or the other.',
      );
    }
  }
  if (problems.length > 0 || manifest === undefined) {
    throw new PackError(problems);
  }
  return { manifest, systemPrompt, pictures };
}
