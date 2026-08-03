// Finding one item in a companion's media from a request in their own words.
// Lexical overlap over the two texts each item carries: deliberately simple,
// deliberately replaceable, and pure — so it is pinned by tests rather than by
// faking a model. Which retrieval method scores best needs a benchmark this
// repo doesn't have (roadmap/INFERENCE-LIBRARY.md). The tool contract above it
// is independent of the method underneath.
import type { MediaKind } from '@/lib/goonpacks/media';
import type { CompanionMedia } from './companions';

export type MediaHit = { ref: string; caption: string; kind: MediaKind };

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

// Words a request and a caption can use for the same thing, folded to the first
// of each group before either is scored. Folding rather than expanding the
// query keeps one query word worth one hit: an item whose caption carries two
// words from a group would otherwise score twice for a request naming either.
//
// Grouped by what answers the same request, not by strict synonymy — "labia"
// and "vagina" name different things and find the same pictures. What must not
// be grouped is a word narrower than the group's first: "thong" and "panties"
// are not the same request, and folding them answers one with the other.
// Plurals are listed rather than stemmed, so the table can't over-reach onto a
// word nobody checked.
//
// This is the app's vocabulary, not an experiment's: what a picture can be
// called doesn't change with what wrote the caption.
const SAME: readonly (readonly string[])[] = [
  ['breasts', 'breast', 'boobs', 'boob', 'tits', 'tit', 'titties', 'titty'],
  ['nipples', 'nipple'],
  ['panties', 'knickers'],
  ['vagina', 'pussy', 'cunt', 'vulva', 'labia'],
  ['buttocks', 'bum', 'butt', 'ass', 'arse'],
  ['penis', 'cock', 'dick'],
  ['naked', 'nude'],
];

const CANONICAL = new Map(
  SAME.flatMap((group) => group.map((w) => [w, group[0]!] as const)),
);

const terms = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => CANONICAL.get(w) ?? w);

// A caption is the item's own summary of itself, so a hit there says more than
// one buried in a long description.
const CAPTION_WEIGHT = 2;

export function searchMedia(
  items: readonly CompanionMedia[],
  query: string,
  opts: {
    exclude?: ReadonlySet<string>;
    // Narrows the candidates before scoring, so a companion asking for a video
    // gets the best matching video rather than the best match that happens to
    // be one. Omitted searches both.
    kind?: MediaKind;
  } = {},
): MediaHit[] {
  const wanted = new Set(terms(query));
  if (wanted.size === 0) return [];

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

  // Ties break on ref so the same request twice gives the same answer.
  scored.sort(
    (a, b) => b.score - a.score || a.item.ref.localeCompare(b.item.ref),
  );

  return scored.slice(0, SEARCH_LIMIT).map(({ item }) => ({
    ref: item.ref,
    caption: item.caption,
    kind: item.kind,
  }));
}
