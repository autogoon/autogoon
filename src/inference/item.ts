// What the routes carry, on both sides of them. Kept apart from corpus.ts and
// packs.ts because those modules import node's filesystem: the panel needs
// these types, and a value import of either reader would drag `node:fs` into
// the browser bundle.

import type { MediaKind } from '@/lib/goonpacks/media';
import type { Labels } from './labels';
import type { RunFields } from './runs';

// A pack source holding a corpus, and how many items are in it. The directory
// name is what the URL carries and what a request names, so it is the value
// behind the screen's pack picker as well as its label.
export type PackSource = { dir: string; items: number };

// Derived from the directory listing alone — see corpus.ts. `runs` holds the
// experiments that have answered this item, in the order their ids sort.
export type CorpusItem = {
  stem: string;
  file: string;
  kind: MediaKind;
  hasLabels: boolean;
  runs: string[];
};

// An item with its ground truth attached, and one experiment's answers for it.
// `labels` is null where no file exists, and `{}` where one exists holding
// nothing; `run` is null where the surveyed experiment hasn't answered this
// item. Which experiment that is comes from the request — see corpus.ts.
export type SurveyedItem = CorpusItem & {
  labels: Labels | null;
  run: RunFields | null;
};

export const mediaUrl = (pack: string, file: string): string =>
  `/api/inference/media?pack=${encodeURIComponent(pack)}&file=${encodeURIComponent(file)}`;
