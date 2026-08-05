// What the Inference screen is looking at when the URL doesn't say: the pack
// and the experiment last selected, and the rule that settles both.
//
// Storage is the shape of src/lib/listen-on-load.ts — the keys and their
// accessors, nothing held between calls. The rule is `choose`, kept apart from
// the hook that calls it so what the screen opens on is one function rather
// than a sequence of effects.

export const PACK_STORAGE_KEY = 'autogoon-inference-pack';
export const EXPERIMENT_STORAGE_KEY = 'autogoon-inference-experiment';

export type Chosen = { pack: string; experiment: string };

// Empty for anything unstored, and for a browser with no storage at all — the
// same answer as never having selected one, which `choose` then fills from
// what is on offer.
const read = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

export const remembered = (): Chosen => ({
  pack: read(PACK_STORAGE_KEY),
  experiment: read(EXPERIMENT_STORAGE_KEY),
});

export function remember({ pack, experiment }: Chosen): void {
  try {
    localStorage.setItem(PACK_STORAGE_KEY, pack);
    localStorage.setItem(EXPERIMENT_STORAGE_KEY, experiment);
  } catch {
    // ignore: storage full or unavailable
  }
}

// What the URL names, else what was last selected if it is still on offer, else
// the first thing on offer. A name the URL carries is taken as given and not
// checked against the list: the routes refuse a pack they don't have, which
// says so under the address that was linked rather than quietly showing another
// pack's items.
const pick = (asked: string, offered: string[], last: string): string =>
  asked !== '' ? asked : offered.includes(last) ? last : (offered[0] ?? '');

export const choose = (
  route: Chosen,
  packs: string[],
  experiments: string[],
  last: Chosen,
): Chosen => ({
  pack: pick(route.pack, packs, last.pack),
  experiment: pick(route.experiment, experiments, last.experiment),
});
