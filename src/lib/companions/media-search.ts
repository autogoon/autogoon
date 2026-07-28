// Finding one item in a companion's media from a request in their own words.
// Lexical overlap over the two texts each item carries: deliberately simple,
// deliberately replaceable, and pure — so it is pinned by tests rather than by
// faking a model. Which retrieval method actually wins is measured against a
// yardstick that doesn't exist yet (roadmap/INFERENCE-LIBRARY.md); the tool
// contract above it doesn't change when the answer arrives.
import type { MediaKind } from '@/lib/goonpacks/media';
import type { CompanionMedia } from './companions';

export type MediaHit = { ref: string; caption: string; kind: MediaKind };

// An object rather than a bare array: the session-scoping levers the roadmap
// weighs — a cursor, a "there are more" count — land here without changing what
// callers destructure.
export type MediaSearchResult = { hits: MediaHit[] };

// How many matches a search hands back. Big enough that a topic yields a set to
// send from over several turns, small enough to stay cheap in context.
export const SEARCH_LIMIT = 25;

// Words carrying no discriminating power in a request phrased as a sentence.
const STOP = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'he',
  'her',
  'him',
  'his',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'she',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'with',
  'you',
  'your',
]);

const terms = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

// A caption is the item's own summary of itself, so a hit there says more than
// one buried in a long description.
const CAPTION_WEIGHT = 2;

export function searchMedia(
  items: readonly CompanionMedia[],
  query: string,
  opts: {
    limit?: number;
    exclude?: ReadonlySet<string>;
    // Narrows the candidates before scoring, so a companion asking for a video
    // gets the best matching video rather than the best match that happens to
    // be one. Omitted searches both.
    kind?: MediaKind;
  } = {},
): MediaSearchResult {
  const wanted = new Set(terms(query));
  if (wanted.size === 0) return { hits: [] };
  const limit = opts.limit ?? SEARCH_LIMIT;

  const scored: { item: CompanionMedia; score: number }[] = [];
  for (const item of items) {
    if (opts.kind !== undefined && item.kind !== opts.kind) continue;
    if (opts.exclude?.has(item.ref) === true) continue;
    const caption = new Set(terms(item.caption));
    const long = new Set(terms(item.description));
    let score = 0;
    for (const w of wanted) {
      if (caption.has(w)) score += CAPTION_WEIGHT;
      else if (long.has(w)) score += 1;
    }
    if (score > 0) scored.push({ item, score });
  }

  // Ties break on ref so the same request twice gives the same answer. That is
  // a contract a sampling lever would deliberately break, not an accident.
  scored.sort(
    (a, b) => b.score - a.score || a.item.ref.localeCompare(b.item.ref),
  );

  return {
    hits: scored.slice(0, limit).map(({ item }) => ({
      ref: item.ref,
      caption: item.caption,
      kind: item.kind,
    })),
  };
}
