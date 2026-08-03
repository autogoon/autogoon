// The experiment registry: id to module. It holds nothing that changes what a
// model returns, which is why it sits outside the directories it lists — an
// entry added here moves no experiment's version (see fingerprint.ts).

import type { Experiment } from '../experiment';
import { experiment as baseline } from './2026-08-02-baseline';

export const EXPERIMENTS: Experiment[] = [baseline];

// The one the screen's experiment picker starts on. Adding an experiment puts
// it in the list; it is not what the screen opens with until this moves.
export const CURRENT = baseline;

export const experimentById = (id: string): Experiment | undefined =>
  EXPERIMENTS.find((e) => e.id === id);
