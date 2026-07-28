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
