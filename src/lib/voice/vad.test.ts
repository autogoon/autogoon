import { describe, it, expect } from '@jest/globals';
import { initVadState, vadStep, type VadConfig } from './vad';

const CFG: VadConfig = {
  onRms: 0.05,
  offRms: 0.02,
  attackFrames: 2,
  hangoverFrames: 3,
};

function run(rmsSeq: number[]) {
  let s = initVadState();
  const events: string[] = [];
  for (const rms of rmsSeq) {
    const r = vadStep(s, rms, CFG);
    s = r.state;
    if (r.onset) events.push('onset');
    if (r.offset) events.push('offset');
  }
  return { speaking: s.speaking, events };
}

describe('vadStep', () => {
  it('fires onset only after attackFrames above onRms', () => {
    expect(run([0.1]).events).toEqual([]); // 1 frame, not yet
    expect(run([0.1, 0.1]).events).toEqual(['onset']); // 2 frames confirm
  });

  it('does not fire onset on a single loud blip (debounced)', () => {
    expect(run([0.1, 0, 0, 0]).events).toEqual([]);
  });

  it('fires offset only after hangoverFrames below offRms', () => {
    const r = run([0.1, 0.1, 0.01, 0.01, 0.01]);
    expect(r.events).toEqual(['onset', 'offset']);
    expect(r.speaking).toBe(false);
  });

  it('stays speaking through a short dip above offRms', () => {
    const r = run([0.1, 0.1, 0.03, 0.03, 0.1]); // 0.03 is between off and on
    expect(r.events).toEqual(['onset']);
    expect(r.speaking).toBe(true);
  });
});
