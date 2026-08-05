// Which version of an experiment produced a result. An experiment is not
// frozen: a finding from one feeds back into an earlier one, which is then
// re-run. So what the corpus has to say is not that the code never changed but
// which items ran under the code as it stands now, and which are left over from
// before an edit.
//
// The version is a hash of the experiment's directory — every file deciding
// what the model is sent and how its reply is read. README.md and tests are
// left out on the test experiments/index.ts already applies to itself: neither
// changes what a model returns, and a typo fixed in prose should not put a
// whole sweep out of date.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const EXPERIMENTS_DIR = join('src', 'inference', 'experiments');

// Long enough that a collision is not worth thinking about, short enough to
// read in a report beside the experiment's own name.
const LENGTH = 12;

export const versions = (name: string): boolean =>
  name !== 'README.md' && !name.endsWith('.test.ts');

// The pure half: named contents in, one version out. The name is hashed as well
// as the bytes, so renaming a file changes the version even where nothing
// inside any file did.
export function fingerprintOf(
  files: { name: string; bytes: Uint8Array | string }[],
): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(file.name);
    hash.update(file.bytes);
  }
  return hash.digest('hex').slice(0, LENGTH);
}

export async function fingerprint(experiment: string): Promise<string> {
  const dir = join(process.cwd(), EXPERIMENTS_DIR, experiment);
  // Recursive, because a version that quietly ignored a subdirectory would be
  // a wrong answer rather than a missing one.
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && versions(e.name));
  return fingerprintOf(
    await Promise.all(
      files.map(async (e) => {
        const path = join(e.parentPath, e.name);
        return { name: relative(dir, path), bytes: await readFile(path) };
      }),
    ),
  );
}
