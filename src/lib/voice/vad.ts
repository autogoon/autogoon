export type VadConfig = {
  onRms: number; // enter "speaking" above this
  offRms: number; // leave "speaking" below this (offRms < onRms → hysteresis)
  attackFrames: number; // consecutive above-onRms frames to confirm onset
  hangoverFrames: number; // consecutive below-offRms frames to confirm offset
};

export type VadState = { speaking: boolean; above: number; below: number };

export function initVadState(): VadState {
  return { speaking: false, above: 0, below: 0 };
}

export function vadStep(
  state: VadState,
  rms: number,
  cfg: VadConfig,
): { state: VadState; onset: boolean; offset: boolean } {
  let { speaking, above, below } = state;
  let onset = false;
  let offset = false;

  if (rms >= cfg.onRms) {
    above += 1;
    below = 0;
    if (!speaking && above >= cfg.attackFrames) {
      speaking = true;
      onset = true;
    }
  } else if (rms < cfg.offRms) {
    below += 1;
    above = 0;
    if (speaking && below >= cfg.hangoverFrames) {
      speaking = false;
      offset = true;
    }
  } else {
    // Between thresholds: hold state, reset the opposing counter.
    if (speaking) below = 0;
    else above = 0;
  }

  return { state: { speaking, above, below }, onset, offset };
}
