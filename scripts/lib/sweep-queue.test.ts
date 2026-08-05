import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  recommend: true,
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

  it("appends questions to the file's own question file", () => {
    const queue = sweepQueue(out);
    queue.question('modes/GOON.md', 'doc', finding, 'non-mechanical');
    queue.question('modes/GOON.md', 'doc', finding, 'verify-fail: lost a fact');
    const questions = readFileSync(
      join(out, 'modes--GOON.md.questions.md'),
      'utf8',
    );
    expect(questions).toContain('modes/GOON.md — doc — drift');
    expect(questions).toContain('old text');
    expect(questions).toContain('src/x.ts:1');
    expect(questions).toContain('verify-fail: lost a fact');
  });

  it('reset removes every question file and report from earlier runs', () => {
    const queue = sweepQueue(out);
    queue.question('README.md', 'doc', finding, 'non-mechanical');
    queue.writeReport('README.md', 'doc', { findings: [] });
    queue.question('MODES.md', 'doc', finding, 'non-mechanical');
    queue.writeReport('MODES.md', 'style', { findings: [] });
    queue.reset();
    expect(existsSync(join(out, 'README.md.questions.md'))).toBe(false);
    expect(existsSync(join(out, 'MODES.md.questions.md'))).toBe(false);
    expect(existsSync(join(out, 'reports'))).toBe(false);
  });

  it('reset leaves a file the sweep did not write', () => {
    const queue = sweepQueue(out);
    queue.question('README.md', 'doc', finding, 'non-mechanical');
    writeFileSync(join(out, 'notes.md'), 'mine\n');
    queue.reset();
    expect(readFileSync(join(out, 'notes.md'), 'utf8')).toBe('mine\n');
  });

  it('reset on an empty output directory is a no-op', () => {
    expect(() => sweepQueue(out).reset()).not.toThrow();
  });
});
