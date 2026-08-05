import { describe, expect, it } from '@jest/globals';
import { applyFindings } from './sweep-apply';
import type { Finding } from './sweep-findings';

function finding(old: string, replacement: string): Finding {
  return {
    category: 'style',
    old,
    new: replacement,
    evidence: 'e',
    rationale: 'r',
    mechanical: true,
  };
}

describe('applyFindings', () => {
  it('replaces a uniquely matching finding', () => {
    const result = applyFindings('a stale line here', [
      finding('stale line', 'fresh line'),
    ]);
    expect(result.content).toBe('a fresh line here');
    expect(result.applied).toHaveLength(1);
    expect(result.bounced).toHaveLength(0);
  });

  it('deletes when new is empty', () => {
    const result = applyFindings('keep. drop this. keep.', [
      finding(' drop this.', ''),
    ]);
    expect(result.content).toBe('keep. keep.');
  });

  it('bounces a finding whose old text is absent', () => {
    const result = applyFindings('nothing matches', [finding('ghost', 'g')]);
    expect(result.content).toBe('nothing matches');
    expect(result.bounced).toHaveLength(1);
    expect(result.bounced[0]!.reason).toBe('not-found');
  });

  it('bounces a finding whose old text matches twice', () => {
    const result = applyFindings('dup dup', [finding('dup', 'one')]);
    expect(result.content).toBe('dup dup');
    expect(result.bounced).toHaveLength(1);
    expect(result.bounced[0]!.reason).toBe('not-unique');
  });

  it('bounces a finding whose replacement equals its target', () => {
    const result = applyFindings('same', [finding('same', 'same')]);
    expect(result.bounced).toHaveLength(1);
    expect(result.bounced[0]!.reason).toBe('no-op');
  });

  it('applies sequentially so a later finding matches earlier output', () => {
    const result = applyFindings('first second', [
      finding('first', '1st'),
      finding('1st second', 'done'),
    ]);
    expect(result.content).toBe('done');
    expect(result.applied).toHaveLength(2);
  });
});
