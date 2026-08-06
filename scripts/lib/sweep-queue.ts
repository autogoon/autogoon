// The sweep's paper trail: every raw find report (audit), and the questions
// a human settles later — non-mechanical findings, unmatchable replacements,
// and edits verify rejected. Everything sits flat in the output dir, named by
// file: `<file>--<pass>.json` reports beside a `<file>.questions.md`. A run
// begins with reset(): the passes are ordered because each changes what the
// next reads, so output from before the run no longer describes the files on
// disk. reset removes only the names the sweep itself writes, never the
// output dir wholesale. startFile() does the same for one file as its review
// begins, so nothing recorded for it outlives the run that reviews it.

import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { PASSES, type Finding, type Pass } from './sweep-findings';

export type SweepQueue = {
  reset: () => void;
  startFile: (file: string) => void;
  writeReport: (file: string, pass: Pass, report: unknown) => void;
  question: (file: string, pass: Pass, finding: Finding, why: string) => void;
};

const slug = (file: string) => file.replaceAll('/', '--');

const sweepWritten = (name: string) =>
  name.endsWith('.questions.md') ||
  PASSES.some((pass) => name.endsWith(`--${pass}.json`));

export function sweepQueue(outDir: string): SweepQueue {
  const questionFile = (file: string) =>
    join(outDir, `${slug(file)}.questions.md`);
  return {
    reset: () => {
      let entries: string[];
      try {
        entries = readdirSync(outDir);
      } catch {
        return;
      }
      for (const name of entries)
        if (sweepWritten(name)) rmSync(join(outDir, name), { force: true });
    },
    // The moment a file's review starts, everything recorded for it goes.
    startFile: (file) => {
      rmSync(questionFile(file), { force: true });
      for (const pass of PASSES)
        rmSync(join(outDir, `${slug(file)}--${pass}.json`), { force: true });
    },
    writeReport: (file, pass, report) => {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, `${slug(file)}--${pass}.json`),
        JSON.stringify(report, null, 2),
      );
    },
    question: (file, pass, finding, why) => {
      mkdirSync(outDir, { recursive: true });
      const entry = [
        `## ${file} — ${pass} — ${finding.category}`,
        '',
        `- why asked: ${why}`,
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
