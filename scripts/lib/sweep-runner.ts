// The per-file loop: find → apply → format → verify → keep or restore. The
// sweep never commits — kept edits accumulate in the working tree for human
// review. Every claude call is a fresh context; this module holds no prose,
// only plumbing, so nothing here can drift toward the register being removed.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyFindings } from './sweep-apply';
import type { ClaudeRunner } from './sweep-claude';
import {
  FINDINGS_SCHEMA,
  VERDICT_SCHEMA,
  parseFindReport,
  parseVerdict,
  type Pass,
  type Verdict,
} from './sweep-findings';
import type { SweepGit } from './sweep-git';
import type { SweepQueue } from './sweep-queue';

export type RunnerDeps = {
  claude: ClaudeRunner;
  git: SweepGit;
  queue: SweepQueue;
  format: (file: string) => Promise<void>;
  briefs: Record<Pass | 'verify', string>;
  cwd: string;
  log: (line: string) => void;
  dryRun: boolean;
  model?: string;
};

export async function sweepFile(
  file: string,
  passes: Pass[],
  deps: RunnerDeps,
): Promise<void> {
  if (deps.git.fileIsDirty(file)) {
    deps.log(`${file}: dirty before sweep, skipped`);
    return;
  }
  for (const pass of passes) {
    try {
      await runPass(file, pass, deps);
    } catch (error) {
      deps.log(`${file} [${pass}]: ${String(error)}`);
    }
  }
}

async function runPass(file: string, pass: Pass, deps: RunnerDeps) {
  const { claude, git, queue, briefs, cwd, log, dryRun, model } = deps;
  const raw = await claude({
    prompt: `${briefs[pass]}\n\nFile: ${file}`,
    schema: FINDINGS_SCHEMA,
    model,
  });
  queue.writeReport(file, pass, raw);
  const report = parseFindReport(raw);
  // A finding the agent itself advises against stays in the raw report and
  // goes no further: not applying a fix needs no human gate.
  const endorsed = report.findings.filter((f) => f.recommend);

  // One outcome line per pass, whatever happened: `queued` counts every
  // questions.md entry this pass wrote, `applied` the edits kept on disk.
  const outcome = (queued: number, applied: number, note = '') =>
    log(
      `${file} [${pass}]: findings ${report.findings.length}, ` +
        `endorsed ${endorsed.length}, applied ${applied}, ` +
        `queued ${queued}${note}`,
    );

  const nonMechanical = endorsed.filter((f) => !f.mechanical);
  for (const finding of nonMechanical)
    queue.question(file, pass, finding, 'non-mechanical');
  if (dryRun) {
    outcome(nonMechanical.length, 0, ' (dry run)');
    return;
  }

  const path = join(cwd, file);
  const snapshot = readFileSync(path, 'utf8');
  const { content, applied, bounced } = applyFindings(
    snapshot,
    endorsed.filter((f) => f.mechanical),
  );
  for (const bounce of bounced)
    queue.question(file, pass, bounce.finding, bounce.reason);
  const queued = nonMechanical.length + bounced.length;
  if (applied.length === 0) {
    outcome(queued, 0);
    return;
  }

  writeFileSync(path, content);
  let verdict: Verdict;
  try {
    await deps.format(file);
    verdict = parseVerdict(
      await claude({
        prompt: `${briefs.verify}\n\n${git.passDiff(file, snapshot)}`,
        schema: VERDICT_SCHEMA,
        model,
      }),
    );
  } catch (error) {
    writeFileSync(path, snapshot);
    throw error;
  }
  if (verdict.ok) {
    outcome(queued, applied.length, ', kept in working tree');
  } else {
    writeFileSync(path, snapshot);
    const why = `verify-fail: ${verdict.reasons.join('; ')}`;
    for (const finding of applied) queue.question(file, pass, finding, why);
    outcome(queued + applied.length, 0, ' (verify failed, restored)');
  }
}
