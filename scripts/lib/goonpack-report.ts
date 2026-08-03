// The build's warning lines. Both report something parsePack accepted but the
// author probably didn't mean — a describing pass left half done, or a file
// under media/ that nothing will ever play — so each one names a count and a
// few examples rather than a line per file.

// How many files are named before the list is elided. A pack early in
// describing has thousands, and a line per file buries the status above it.
const NAMED = 3;

const listed = (items: string[]): string =>
  `${items.slice(0, NAMED).join(', ')}${items.length > NAMED ? ', …' : ''}`;

export function captionWarning(undescribed: string[]): string | null {
  if (undescribed.length === 0) return null;
  const plural = undescribed.length === 1 ? '' : 's';
  return `${undescribed.length} media file${plural} with no sidecar (${listed(undescribed)})`;
}

export function strayWarning(strays: string[]): string | null {
  if (strays.length === 0) return null;
  const [name, verb] =
    strays.length === 1 ? ['basename', "doesn't"] : ['basenames', "don't"];
  return `${strays.length} ${name} which ${verb} have a valid media kind (${listed(strays)})`;
}
