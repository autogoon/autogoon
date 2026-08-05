// The sweep's git surface: read-only. It reports dirtiness (the checkout may
// hold another session's uncommitted work) and renders per-pass diffs. It
// never stages, commits or restores — sweep edits stay in the working tree
// for human review.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type SweepGit = {
  fileIsDirty: (file: string) => boolean;
  passDiff: (file: string, before: string) => string;
};

export function sweepGit(cwd: string): SweepGit {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' });
  return {
    fileIsDirty: (file) => git('status', '--porcelain', '--', file) !== '',
    // `git diff --no-index` exits 1 when the sides differ, so the diff
    // arrives on the thrown error's stdout rather than the return value.
    passDiff: (file, before) => {
      const dir = mkdtempSync(join(tmpdir(), 'sweep-diff-'));
      try {
        const snapshot = join(dir, 'before');
        writeFileSync(snapshot, before);
        try {
          return git('diff', '--no-index', '--', snapshot, file);
        } catch (error) {
          const stdout = (error as { stdout?: unknown }).stdout;
          if (typeof stdout === 'string' && stdout !== '') return stdout;
          throw error;
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
