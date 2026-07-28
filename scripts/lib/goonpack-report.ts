// The build's non-fatal reporting. A media file with no sidecar yet is not an
// error — parsePack leaves both its texts empty so a pack still being described
// keeps building — so nothing here fails a build or holds back a zip. It exists
// to stop "0 errors, built" from being the whole story while that is still
// true. A sidecar that exists but won't parse is parsePack's, and fatal.
import type { ParsedMedia } from '../../src/lib/goonpacks/pack';

// How many files are named before the list is elided. A pack early in
// describing has thousands, and a line per file buries the status above it.
const NAMED = 3;

// An empty caption means no sidecar: parsePack only fills the texts from one it
// parsed, and parseSidecar refuses a sidecar whose caption is empty.
export function captionWarning(media: ParsedMedia[]): string | null {
  const missing = media.filter((m) => m.caption === '');
  if (missing.length === 0) return null;
  const names = missing
    .slice(0, NAMED)
    .map((m) => m.file)
    .join(', ');
  const more = missing.length > NAMED ? ', …' : '';
  const plural = missing.length === 1 ? '' : 's';
  return `${missing.length} media file${plural} with no sidecar (${names}${more})`;
}
