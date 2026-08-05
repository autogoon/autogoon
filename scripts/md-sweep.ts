// scripts/md-sweep.ts
// Enumerates the tracked .md set and drives sweep-runner over it, one file
// at a time, root docs first. Sequential on purpose: reports must be
// reviewable in the questions file faster than they accumulate. A re-run
// skips as dirty any file whose earlier sweep edits are still unreviewed in
// the working tree.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { claudeRunner } from './lib/sweep-claude';
import type { Pass } from './lib/sweep-findings';
import { sweepGit } from './lib/sweep-git';
import { sweepQueue } from './lib/sweep-queue';
import { sweepFile } from './lib/sweep-runner';

const PASSES: Pass[] = ['doc', 'style', 'register', 'duplication'];

// Persona prompts are not documentation (doc-check → The document set), and
// CHECK-QUESTIONS.md is a transient decision queue.
const EXCLUDED = [/^goonpacks\/.*system-prompt\.md$/, /^CHECK-QUESTIONS\.md$/];

// Most-read first: the root docs are what other files point at.
function rank(file: string): number {
  if (!file.includes('/')) return 0;
  for (const [i, prefix] of [
    'modes/',
    'roadmap/',
    'docs/',
    '.claude/skills/',
  ].entries())
    if (file.startsWith(prefix)) return i + 1;
  return 5;
}

const { values } = parseArgs({
  options: {
    files: { type: 'string', multiple: true },
    passes: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    model: { type: 'string' },
    out: { type: 'string', default: '.sweep' },
  },
});

const cwd = process.cwd();
const tracked = execFileSync('git', ['ls-files', '*.md'], {
  cwd,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .filter((file) => !EXCLUDED.some((pattern) => pattern.test(file)));

const files = (values.files ?? tracked).sort(
  (a, b) => rank(a) - rank(b) || a.localeCompare(b),
);
const passes = (values.passes?.split(',') as Pass[] | undefined) ?? PASSES;
for (const pass of passes)
  if (!PASSES.includes(pass)) throw new Error(`unknown pass: ${pass}`);

const briefsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'md-sweep-briefs',
);
const brief = (name: string) =>
  readFileSync(join(briefsDir, `${name}.md`), 'utf8');

const deps = {
  claude: claudeRunner({ cwd }),
  git: sweepGit(cwd),
  queue: sweepQueue(join(cwd, values.out)),
  format: async (file: string) => {
    execFileSync('npx', ['prettier', '--write', file], { cwd });
  },
  briefs: {
    doc: brief('doc'),
    style: brief('style'),
    register: brief('register'),
    duplication: brief('duplication'),
    verify: brief('verify'),
  },
  cwd,
  log: (line: string) => console.error(line),
  dryRun: values['dry-run'],
  model: values.model,
};

console.error(
  `${files.length} files, passes: ${passes.join(', ')}${
    deps.dryRun ? ' (dry run)' : ''
  }`,
);
for (const file of files) await sweepFile(file, passes, deps);
console.error(
  `done — review the working diff with git diff; questions and reports in ${values.out}/`,
);
