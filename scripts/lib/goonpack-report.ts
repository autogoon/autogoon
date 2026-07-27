// The build's non-fatal reporting. A caption is optional by design — GOONPACKS.md
// says a media file without one still works, the companion just knows nothing
// about it — so nothing here fails a build or holds back a zip. It exists to
// stop "0 errors, built" from being the whole story while a pack is still being
// captioned.
import type { ParsedMedia } from '../../src/lib/goonpacks/pack';

// How many files are named before the list is elided. A pack early in
// captioning has thousands, and a line per file buries the status above it.
const NAMED = 3;

export function captionWarning(media: ParsedMedia[]): string | null {
  const missing = media.filter((m) => m.description === '');
  if (missing.length === 0) return null;
  const names = missing
    .slice(0, NAMED)
    .map((m) => m.file)
    .join(', ');
  const more = missing.length > NAMED ? ', …' : '';
  const plural = missing.length === 1 ? '' : 's';
  return `${missing.length} media file${plural} with no caption (${names}${more})`;
}
