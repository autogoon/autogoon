// A media item's sidecar: one `.md` beside the file, carrying the caption in
// YAML frontmatter and the long description as the body. The body is stored
// opaquely — what a description should say belongs to
// roadmap/INFERENCE-LIBRARY.md, so nothing here reads into it.
//
// The frontmatter library is imported here and nowhere else, so swapping it is
// a one-file change.
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// The field names are the ones ParsedMedia and CompanionMedia use, so reading a
// sidecar into an item copies both across with nothing to get backwards.
export type Sidecar = { caption: string; description: string };

export const SIDECAR_EXT = 'md';

export class SidecarError extends Error {}

// Frontmatter keys a sidecar may carry. An unknown key is refused rather than
// ignored: a mistyped `capton:` would otherwise lose the caption silently.
const KEYS = new Set(['caption']);

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseSidecar(text: string): Sidecar {
  const match = FENCE.exec(text);
  if (match === null) {
    throw new SidecarError(
      'A sidecar needs YAML frontmatter opening the file with ---.',
    );
  }
  let front: unknown;
  try {
    front = parseYaml(match[1] ?? '');
  } catch {
    throw new SidecarError("The sidecar's frontmatter isn't valid YAML.");
  }
  if (typeof front !== 'object' || front === null || Array.isArray(front)) {
    throw new SidecarError("The sidecar's frontmatter isn't a set of fields.");
  }
  const fields = front as Record<string, unknown>;
  for (const key of Object.keys(fields)) {
    if (!KEYS.has(key)) {
      throw new SidecarError(
        `Unknown field in the sidecar frontmatter: ${key}.`,
      );
    }
  }
  const caption = fields.caption;
  if (typeof caption !== 'string' || caption.trim() === '') {
    throw new SidecarError(
      'The sidecar needs a caption field with text in it.',
    );
  }
  const description = text.slice(match[0].length).trim();
  if (description === '') {
    throw new SidecarError(
      'The sidecar needs a description in the body, under the frontmatter.',
    );
  }
  return { caption: caption.trim(), description };
}

// The one writer of the format, used by the describing scripts. `lineWidth: 0`
// keeps a caption on one line however long it runs: a folded caption still
// parses back, but a hand-written sidecar has it on one line and the two should
// read the same.
export function renderSidecar(s: Sidecar): string {
  const front = stringifyYaml({ caption: s.caption }, { lineWidth: 0 });
  return `---\n${front}---\n\n${s.description}\n`;
}
