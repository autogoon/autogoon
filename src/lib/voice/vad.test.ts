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
    expect(run([0.1]).events).toEqual([]);
    expect(run([0.1, 0.1]).events).toEqual(['onset']);
  });

  it('fires onset once per utterance, not on every frame that stays above onRms', () => {
    expect(run([0.1, 0.1, 0.1, 0.1]).events).toEqual(['onset']);
  });

  it('does not fire onset when the frames above onRms are not consecutive', () => {
    expect(run([0.1, 0, 0.1]).events).toEqual([]);
  });

  it('restarts the attack count when a frame lands between offRms and onRms', () => {
    expect(run([0.1, 0.03, 0.1]).events).toEqual([]);
  });

  it('fires offset only after hangoverFrames below offRms', () => {
    const r = run([0.1, 0.1, 0.01, 0.01, 0.01]);
    expect(r.events).toEqual(['onset', 'offset']);
    expect(r.speaking).toBe(false);
  });

  it('does not fire offset before any onset has been confirmed', () => {
    expect(run([0.01, 0.01, 0.01, 0.01]).events).toEqual([]);
  });

  it('stays speaking through a dip above offRms for longer than hangoverFrames', () => {
    const r = run([0.1, 0.1, 0.03, 0.03, 0.03, 0.03]); // 0.03 is between off and on
    expect(r.events).toEqual(['onset']);
    expect(r.speaking).toBe(true);
  });

  it('restarts the hangover count when a frame lands between offRms and onRms', () => {
    const r = run([0.1, 0.1, 0.01, 0.01, 0.03, 0.01, 0.01]);
    expect(r.events).toEqual(['onset']);
    expect(r.speaking).toBe(true);
  });

  it('restarts the hangover count when a frame climbs back above onRms', () => {
    const r = run([0.1, 0.1, 0.01, 0.01, 0.1, 0.01, 0.01]);
    expect(r.events).toEqual(['onset']);
    expect(r.speaking).toBe(true);
  });

  it('fires a second onset once speech resumes after an offset', () => {
    const r = run([0.1, 0.1, 0.01, 0.01, 0.01, 0.1, 0.1]);
    expect(r.events).toEqual(['onset', 'offset', 'onset']);
    expect(r.speaking).toBe(true);
  });
});
