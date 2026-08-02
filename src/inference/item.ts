// What one corpus item is, on both sides of the routes. Kept apart from
// corpus.ts because that module imports node's filesystem: the panel needs
// these types, and a value import of the reader would drag `node:fs` into the
// browser bundle.

import type { MediaKind } from '@/lib/goonpacks/media';
import type { Labels } from './labels';

// Derived from the directory listing alone — see corpus.ts. `runs` holds the
// experiments that have answered this item, in the order their ids sort.
export type CorpusItem = {
  stem: string;
  file: string;
  kind: MediaKind;
  hasLabels: boolean;
  runs: string[];
};

// An item with its ground truth attached. `labels` is null where no file
// exists, and `{}` where one exists holding nothing.
export type SurveyedItem = CorpusItem & { labels: Labels | null };

export const mediaUrl = (file: string): string =>
  `/api/inference/media?file=${encodeURIComponent(file)}`;
