// scripts/md-sweep.ts
// Enumerates the tracked .md set and drives sweep-runner over it, root docs
// first. Files run through a bounded worker pool (--concurrency); the four
// passes within a file stay sequential, because each pass edits what the
// next one reads. A re-run skips as dirty any file whose earlier sweep edits
// are still unreviewed in the working tree.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { claudeRunner } from './lib/sweep-claude';
import type { Pass } from './lib/sweep-findings';
import { sweepGit } from './lib/sweep-git';
import { sweepQueue } from './lib/sweep-queue';
import { sweepFile } from './lib/sweep-runner';

const PASSES: Pass[] = ['doc', 'style', 'register', 'duplication'];

// Persona prompts are not documentation (doc-check → The document set),
// CHECK-QUESTIONS.md is a transient decision queue, and the sweep's own
// briefs are prompts, not documentation — the same rationale as the personas.
const EXCLUDED = [
  /^goonpacks\/.*system-prompt\.md$/,
  /^CHECK-QUESTIONS\.md$/,
  /^scripts\/md-sweep-briefs\//,
];

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
    // Defaults to opus rather than inheriting the operator's session model.
    model: { type: 'string', default: 'opus' },
    out: { type: 'string', default: '.sweep' },
    // Files in flight at once; 1 restores a fully sequential run.
    concurrency: { type: 'string', default: '4' },
  },
});

const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1)
  throw new Error(`--concurrency must be a positive integer`);

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
  queue: sweepQueue(resolve(cwd, values.out)),
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
  `${files.length} files, passes: ${passes.join(', ')}, concurrency ${concurrency}${
    deps.dryRun ? ' (dry run)' : ''
  }`,
);
// Any run invalidates all earlier sweep output — the doc pass edits what the
// later passes read, so nothing recorded before this run still describes the
// files on disk.
deps.queue.reset();
// Workers pull from one shared iterator, so each file runs exactly once and
// an early finisher moves straight on to the next.
const remaining = files[Symbol.iterator]();
await Promise.all(
  Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    for (const file of remaining) await sweepFile(file, passes, deps);
  }),
);
console.error(
  `done — review the working diff with git diff; questions and reports in ${values.out}/`,
);
