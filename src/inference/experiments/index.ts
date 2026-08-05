// The experiment registry: id to module. It holds nothing that changes what a
// model returns, which is why it sits outside the directories it lists — an
// entry added here moves no experiment's version (see fingerprint.ts).

import type { Experiment } from '../experiment';
import { experiment as baseline } from './2026-08-02-baseline';

// The order the screen's experiment picker offers them in, and the first is
// what it opens on when nothing has been selected before. No entry is the
// current one: findings from one feed back into another, so the set is not a
// series with a head.
export const EXPERIMENTS: Experiment[] = [baseline];

export const experimentById = (id: string): Experiment | undefined =>
  EXPERIMENTS.find((e) => e.id === id);
