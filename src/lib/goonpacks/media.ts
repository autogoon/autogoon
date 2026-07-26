// The pack format's media vocabulary: what a media file may be, and what in a
// pack's file list isn't one. Shared by validation, extraction and the
// authoring build script — no I/O, no manifest knowledge.

export type MediaKind = 'image' | 'video';

// Stills and videos a pack may carry, by lowercased extension. .mov is
// deliberately absent: it plays in Safari and unreliably elsewhere, so
// accepting it yields packs that work on their author's machine and not on a
// stranger's — parsePack rejects it by name with a message saying so.
export const MEDIA_TYPES: Record<
  string,
  { kind: MediaKind; mimeType: string }
> = {
  jpg: { kind: 'image', mimeType: 'image/jpeg' },
  jpeg: { kind: 'image', mimeType: 'image/jpeg' },
  png: { kind: 'image', mimeType: 'image/png' },
  webp: { kind: 'image', mimeType: 'image/webp' },
  mp4: { kind: 'video', mimeType: 'video/mp4' },
  webm: { kind: 'video', mimeType: 'video/webm' },
};

// The stem is the thread-ref half (goonpack:<key>/<stem>) and the caption
// sidecar's name; the extension decides the kind. Extensions compare
// lowercased, stems never do — a file named Beach.JPG is media "Beach".
export function splitName(file: string): { stem: string; ext: string } {
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return { stem: file, ext: '' };
  return { stem: file.slice(0, dot), ext: file.slice(dot + 1).toLowerCase() };
}

// Housekeeping entries hand-made (Finder, 7-Zip) archives accumulate, plus the
// bare directory entries a zip lists. Stripped on the way into a tree and
// ignored when reading one, so neither validation nor the media list ever sees
// them.
export function isJunkPath(path: string): boolean {
  if (path.startsWith('__MACOSX/') || path.endsWith('/')) return true;
  const base = path.split('/').pop() ?? '';
  return base === '.DS_Store' || base.startsWith('._');
}
