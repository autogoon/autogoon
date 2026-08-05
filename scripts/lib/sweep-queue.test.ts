import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sweepQueue } from './sweep-queue';
import type { Finding } from './sweep-findings';

let out: string;
beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'sweep-queue-'));
});
afterEach(() => rmSync(out, { recursive: true, force: true }));

const finding: Finding = {
  category: 'drift',
  old: 'old text',
  new: 'new text',
  evidence: 'src/x.ts:1',
  rationale: 'because',
  mechanical: false,
};

describe('sweepQueue', () => {
  it('writes a raw report under reports/ named by file and pass', () => {
    sweepQueue(out).writeReport('modes/GOON.md', 'doc', { findings: [] });
    const stored = readFileSync(
      join(out, 'reports', 'modes--GOON.md--doc.json'),
      'utf8',
    );
    expect(JSON.parse(stored)).toEqual({ findings: [] });
  });

  it("appends questions with the finding's evidence and the why", () => {
    const queue = sweepQueue(out);
    queue.question('README.md', 'doc', finding, 'non-mechanical');
    queue.question('README.md', 'doc', finding, 'verify-fail: lost a fact');
    const questions = readFileSync(join(out, 'questions.md'), 'utf8');
    expect(questions).toContain('README.md — doc — drift');
    expect(questions).toContain('old text');
    expect(questions).toContain('src/x.ts:1');
    expect(questions).toContain('verify-fail: lost a fact');
  });

  it('writes a run header before the questions that follow it', () => {
    const queue = sweepQueue(out);
    queue.runHeader('2026-08-05T00:00:00.000Z — 1 files, passes doc');
    queue.question('README.md', 'doc', finding, 'non-mechanical');
    const questions = readFileSync(join(out, 'questions.md'), 'utf8');
    const headerIndex = questions.indexOf(
      '## Run 2026-08-05T00:00:00.000Z — 1 files, passes doc',
    );
    const questionIndex = questions.indexOf('README.md — doc — drift');
    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(questionIndex).toBeGreaterThan(headerIndex);
  });
});
