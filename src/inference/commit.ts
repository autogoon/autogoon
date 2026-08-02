// The commit a run happened at, recorded per item because items are generated
// one at a time over days. It says what the pipeline code looked like; it is
// not what identifies the experiment, which is its directory (see runs.ts).

import { execFileSync } from 'node:child_process';

// Empty where git can't answer — a checkout with no commits, or no git at all.
// A run is still worth recording without it.
export function currentCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}
