// The experiment registry: id to module. This file grows with each experiment
// and is not frozen, unlike the directories it lists — it holds nothing that
// changes what a model returns.

import type { Experiment } from '../experiment';
import { experiment as baseline } from './2026-08-02-baseline';

export const EXPERIMENTS: Experiment[] = [baseline];

// The one the screen's Generate button runs. Adding an experiment doesn't
// change what the button does until this moves.
export const CURRENT = baseline;

export const experimentById = (id: string): Experiment | undefined =>
  EXPERIMENTS.find((e) => e.id === id);
