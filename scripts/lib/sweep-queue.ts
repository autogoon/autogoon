// The sweep's paper trail: every raw find report (audit), and the questions
// a human settles later — non-mechanical findings, unmatchable replacements,
// and edits verify rejected. Questions are per file, in
// `<file>.questions.md` beside `reports/`. A run begins with reset(): the
// passes are ordered because each changes what the next reads, so output
// from before the run no longer describes the files on disk. reset removes
// only what the sweep itself writes, never the output dir wholesale.

import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Finding, Pass } from './sweep-findings';

export type SweepQueue = {
  reset: () => void;
  writeReport: (file: string, pass: Pass, report: unknown) => void;
  question: (file: string, pass: Pass, finding: Finding, why: string) => void;
};

const slug = (file: string) => file.replaceAll('/', '--');

export function sweepQueue(outDir: string): SweepQueue {
  const reportsDir = join(outDir, 'reports');
  const questionFile = (file: string) =>
    join(outDir, `${slug(file)}.questions.md`);
  return {
    reset: () => {
      rmSync(reportsDir, { recursive: true, force: true });
      let entries: string[];
      try {
        entries = readdirSync(outDir);
      } catch {
        return;
      }
      for (const name of entries)
        if (name.endsWith('.questions.md'))
          rmSync(join(outDir, name), { force: true });
    },
    writeReport: (file, pass, report) => {
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(
        join(reportsDir, `${slug(file)}--${pass}.json`),
        JSON.stringify(report, null, 2),
      );
    },
    question: (file, pass, finding, why) => {
      mkdirSync(outDir, { recursive: true });
      const entry = [
        `## ${file} — ${pass} — ${finding.category}`,
        '',
        `- why queued: ${why}`,
        `- old: ${finding.old}`,
        `- new: ${finding.new}`,
        `- evidence: ${finding.evidence}`,
        `- rationale: ${finding.rationale}`,
        '',
        '',
      ].join('\n');
      appendFileSync(questionFile(file), entry);
    },
  };
}
