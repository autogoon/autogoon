// A media item's sidecar: one `.md` beside the file, carrying the caption and
// whatever else is known about the item in YAML frontmatter, and the long
// description as the body. The body is stored opaquely — what a description
// should say belongs to roadmap/INFERENCE-LIBRARY.md, so nothing here reads
// into it.
//
// The frontmatter library is imported here and nowhere else, so swapping it is
// a one-file change.
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// `caption` and the body are the format's own; `values` is everything else the
// frontmatter carried, kept as it was written.
//
// **The pack format does not own the question set.** What is worth recording
// about a picture is inference's to decide (src/inference/fields.ts) and grows
// as it learns what to ask, so a key here is whatever the thing that wrote the
// sidecar chose to put in it. That is why an unknown key is kept rather than
// refused: the alternative is this file carrying a list it has no business
// knowing, and an experiment unable to record anything without editing it.
//
// The names are the ones ParsedMedia and CompanionMedia use, so reading a
// sidecar into an item copies them across with nothing to get backwards.
export type SidecarValue = string | number | boolean;

export type Sidecar = {
  caption: string;
  description: string;
  values: Record<string, SidecarValue>;
};

export const SIDECAR_EXT = 'md';

export class SidecarError extends Error {}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

const isValue = (v: unknown): v is SidecarValue =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

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
  const caption = fields.caption;
  // A mistyped `capton:` shows up here rather than as an unknown key: the
  // caption is the one thing every sidecar must carry, so its absence is what
  // fails.
  if (typeof caption !== 'string' || caption.trim() === '') {
    throw new SidecarError(
      'The sidecar needs a caption field with text in it.',
    );
  }
  const values: Record<string, SidecarValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'caption') continue;
    // A list or a nested map is not something a value can be — nothing writes
    // one, and a search over it would be searching a shape rather than a word.
    if (!isValue(value)) {
      throw new SidecarError(
        `The sidecar's ${key} is not a word, a number or a flag.`,
      );
    }
    values[key] = value;
  }
  const description = text.slice(match[0].length).trim();
  if (description === '') {
    throw new SidecarError(
      'The sidecar needs a description in the body, under the frontmatter.',
    );
  }
  return { caption: caption.trim(), description, values };
}

// The one writer of the format. `lineWidth: 0` keeps a caption on one line
// however long it runs: a folded caption still parses back, but a hand-written
// sidecar has it on one line and the two should read the same. The caption goes
// first, because it is what a person opening the file is looking for.
export function renderSidecar(s: Sidecar): string {
  const front = stringifyYaml(
    { caption: s.caption, ...s.values },
    { lineWidth: 0 },
  );
  return `---\n${front}---\n\n${s.description}\n`;
}
