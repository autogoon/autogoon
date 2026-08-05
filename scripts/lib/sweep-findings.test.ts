import { describe, expect, it } from '@jest/globals';
import { parseFindReport, parseVerdict } from './sweep-findings';

const finding = {
  category: 'drift',
  old: 'the old sentence',
  new: 'the new sentence',
  evidence: 'src/lib/player.ts:12',
  rationale: 'renamed',
  mechanical: true,
};

describe('parseFindReport', () => {
  it('returns the report when every field is present and typed', () => {
    const report = parseFindReport({ findings: [finding], read: 'whole file' });
    expect(report.findings[0]!.old).toBe('the old sentence');
  });

  it('throws naming the field when a finding omits mechanical', () => {
    const { mechanical: _mechanical, ...partial } = finding;
    expect(() => parseFindReport({ findings: [partial], read: 'r' })).toThrow(
      /mechanical/,
    );
  });

  it('throws when findings is not an array', () => {
    expect(() => parseFindReport({ findings: 'none', read: 'r' })).toThrow(
      /findings/,
    );
  });
});

describe('parseVerdict', () => {
  it('returns the verdict when ok and reasons are typed', () => {
    expect(parseVerdict({ ok: false, reasons: ['lost a fact'] }).ok).toBe(
      false,
    );
  });

  it('throws naming the field when reasons is missing', () => {
    expect(() => parseVerdict({ ok: true })).toThrow(/reasons/);
  });
});
