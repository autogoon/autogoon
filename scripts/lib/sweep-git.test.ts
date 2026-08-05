// Runs against a throwaway repo in a temp dir: the module's job is the
// exact git invocations, so faking git would assert the fixture.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sweepGit } from './sweep-git';

let repo: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sweep-git-'));
  git('init');
  git('config', 'user.email', 't@example.invalid');
  git('config', 'user.name', 't');
  writeFileSync(join(repo, 'a.md'), 'one\n');
  writeFileSync(join(repo, 'b.md'), 'other\n');
  git('add', '.');
  git('commit', '-m', 'seed');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('sweepGit', () => {
  it('reports a modified file dirty and a clean file not', () => {
    writeFileSync(join(repo, 'a.md'), 'two\n');
    const ops = sweepGit(repo);
    expect(ops.fileIsDirty('a.md')).toBe(true);
    expect(ops.fileIsDirty('b.md')).toBe(false);
  });

  it('returns the diff between a snapshot and the file on disk', () => {
    writeFileSync(join(repo, 'a.md'), 'two\n');
    const diff = sweepGit(repo).passDiff('a.md', 'one\n');
    expect(diff).toContain('-one');
    expect(diff).toContain('+two');
  });

  it('returns an empty diff when the snapshot matches the file', () => {
    expect(sweepGit(repo).passDiff('a.md', 'one\n')).toBe('');
  });

  it('never commits: the log holds only the seed after every operation', () => {
    writeFileSync(join(repo, 'a.md'), 'two\n');
    const ops = sweepGit(repo);
    ops.fileIsDirty('a.md');
    ops.passDiff('a.md', 'one\n');
    expect(git('log', '--pretty=%s').trim()).toBe('seed');
  });
});
