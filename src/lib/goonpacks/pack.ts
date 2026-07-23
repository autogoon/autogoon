// Zip → ParsedPack. Pure and synchronous (packs are a few MB); used by the
// browser importer, the Jest tests, and nothing else — the authoring build
// script has its own Node-side zip writer.
import { strFromU8, unzipSync } from "fflate";
import { PackError, parseManifest, type PackManifest } from "./manifest";

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

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

// Zip housekeeping entries that hand-made (Finder) zips accumulate.
function isJunk(path: string): boolean {
  return (
    path.startsWith("__MACOSX/") ||
    path.endsWith("/") ||
    path.split("/").pop() === ".DS_Store"
  );
}

export function parsePack(zipBytes: Uint8Array): ParsedPack {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    throw new PackError("not a readable zip");
  }
  const files = Object.entries(entries).filter(([path]) => !isJunk(path));

  const manifestEntry = files.find(([path]) => path === "manifest.json");
  if (manifestEntry === undefined) {
    throw new PackError(
      "no manifest.json at the zip root — zip the pack folder's contents, not the folder",
    );
  }
  let manifest: PackManifest;
  try {
    manifest = parseManifest(JSON.parse(strFromU8(manifestEntry[1])));
  } catch (e) {
    if (e instanceof PackError) throw e;
    throw new PackError("manifest.json is not valid JSON");
  }

  const promptEntry = files.find(([path]) => path === "system-prompt.md");
  const systemPrompt = promptEntry !== undefined ? strFromU8(promptEntry[1]) : undefined;

  const pictures: ParsedPicture[] = [];
  const sidecars = new Map<string, string>();
  for (const [path, bytes] of files) {
    if (!path.startsWith("pictures/")) continue;
    const file = path.slice("pictures/".length);
    if (file.includes("/")) throw new PackError(`nested folder: ${path}`);
    const dot = file.lastIndexOf(".");
    const stem = dot === -1 ? file : file.slice(0, dot);
    const ext = dot === -1 ? "" : file.slice(dot + 1).toLowerCase();
    if (ext === "txt") {
      sidecars.set(stem, strFromU8(bytes).trim());
    } else if (IMAGE_TYPES[ext]) {
      pictures.push({
        name: stem,
        description: "",
        bytes,
        mimeType: IMAGE_TYPES[ext],
      });
    } else {
      throw new PackError(`unsupported file in pictures/: ${file}`);
    }
  }
  for (const p of pictures) p.description = sidecars.get(p.name) ?? "";
  pictures.sort((a, b) => a.name.localeCompare(b.name));

  if (manifest.base === undefined) {
    if (systemPrompt === undefined) {
      throw new PackError("a complete pack needs system-prompt.md");
    }
    if (!manifest.name) throw new PackError("a complete pack needs a name");
    if (!manifest.voiceId) {
      throw new PackError("a complete pack needs a voiceId");
    }
  }
  return { manifest, systemPrompt, pictures };
}
