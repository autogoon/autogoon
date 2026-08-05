// The sweep's paper trail: every raw find report (audit), and the
// questions a human settles later — non-mechanical findings, unmatchable
// replacements, and edits verify rejected.

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, Pass } from './sweep-findings';

export type SweepQueue = {
  writeReport: (file: string, pass: Pass, report: unknown) => void;
  question: (file: string, pass: Pass, finding: Finding, why: string) => void;
};

const slug = (file: string) => file.replaceAll('/', '--');

export function sweepQueue(outDir: string): SweepQueue {
  return {
    writeReport: (file, pass, report) => {
      const dir = join(outDir, 'reports');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${slug(file)}--${pass}.json`),
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
      appendFileSync(join(outDir, 'questions.md'), entry);
    },
  };
}
