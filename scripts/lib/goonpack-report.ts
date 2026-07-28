// The build's non-fatal reporting. A media file with no sidecar yet is not an
// error — parsePack leaves it out of the pack's media and names it in
// `undescribed` instead, so a pack still being described keeps building — and
// nothing here fails a build or holds back a zip. It exists to stop "0 errors,
// built" from being the whole story while that is still true. A sidecar that
// exists but won't parse is parsePack's, and fatal.

// How many files are named before the list is elided. A pack early in
// describing has thousands, and a line per file buries the status above it.
const NAMED = 3;

export function captionWarning(undescribed: string[]): string | null {
  if (undescribed.length === 0) return null;
  const names = undescribed.slice(0, NAMED).join(', ');
  const more = undescribed.length > NAMED ? ', …' : '';
  const plural = undescribed.length === 1 ? '' : 's';
  return `${undescribed.length} media file${plural} with no sidecar (${names}${more})`;
}
