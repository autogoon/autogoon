// Which files a run sweeps, in what order, and which passes it runs. Split
// out of md-sweep.ts because that file starts a sweep the moment it is
// imported, so nothing in it can be reached from a test.

import { PASSES, type Pass } from './sweep-findings';

// Persona prompts are not documentation (doc-check → The document set),
// CHECK-QUESTIONS.md is a transient decision queue, and the sweep's own
// briefs are prompts, not documentation — the same rationale as the personas.
const EXCLUDED = [
  /^goonpacks\/.*system-prompt\.md$/,
  /^CHECK-QUESTIONS\.md$/,
  /^scripts\/md-sweep-briefs\//,
];

// Most-read first: the root docs are what other files point at.
const DIRECTORIES = ['modes/', 'roadmap/', 'docs/', '.claude/skills/'];

function rank(file: string): number {
  if (!file.includes('/')) return 0;
  for (const [i, prefix] of DIRECTORIES.entries())
    if (file.startsWith(prefix)) return i + 1;
  return DIRECTORIES.length + 1;
}

// `only` is what --files gave: swept as named, so a file the enumeration
// excludes can still be swept by asking for it.
export function selectFiles(tracked: string[], only?: string[]): string[] {
  const files =
    only ?? tracked.filter((file) => !EXCLUDED.some((p) => p.test(file)));
  return [...files].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function parsePasses(spec?: string): Pass[] {
  if (spec === undefined) return [...PASSES];
  const passes = spec.split(',') as Pass[];
  for (const pass of passes)
    if (!PASSES.includes(pass)) throw new Error(`unknown pass: ${pass}`);
  return passes;
}
